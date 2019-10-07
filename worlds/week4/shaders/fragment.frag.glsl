#version 300 es        // NEWER VERSION OF GLSL
precision highp float; // HIGH PRECISION FLOATS

uniform vec3  uCursor; // CURSOR: xy=pos, z=mouse up/down
uniform float uTime;   // TIME, IN SECONDS
in vec3 vPos;          // POSITION IN IMAGE
out vec4 fragColor;    // RESULT WILL GO HERE

struct Light {
	vec3 direction; // normalized direction
	vec3 color;
};

struct Material {
	vec3 ambient;
	vec3 diffuse;
	vec3 specular;
	float power;
	vec3 reflect; 			 // Reflection color. Black means no reflection.
	vec3 transparent;        // Transparency color. Black means the object is opaque.
    float indexOfRefraction; // Higher value means light will bend more as it refracts.
};

struct Shape {
	int type; // 0 for sphere, 1 for cube, 2 for octahedron, 3 for cylinder
	vec3 center;
	mat4 matrix;
	mat4 imatrix; // the inverse of above
};

const int NL = 2; // Number of light sources
//const int NM = 4; // Number of materials
const int NS = 4; // Number of shapes

uniform Light uLights[NL];
uniform Material uMaterials[NS];
uniform Shape uShapes[NS];


const float FL = 5.; // Focal length
const vec3 BG_COLOR = vec3(0.02, 0.02, 0.1); // background color (default: black)

vec3 frontSurfaceNormal, rearSurfaceNormal;
mat4 Ss, Sc;

// Function that finds the distance along a ray to a shape
vec2 rayShape(vec3 V, vec3 W, Shape S) {
	// float r = S.size / 2.;

	if (S.type == 0) { // sphere
		mat4 s = mat4(1.,0.,0.,0., 0.,1.,0.,0., 0.,0.,1.,0., 0.,0.,0.,-1.);
		s = transpose(inverse(S.matrix)) * s * inverse(S.matrix);
		s = mat4(s[0].x, s[0].y+s[1].x, s[0].z+s[2].x, s[0].w+s[3].x,
				     0.,        s[1].y, s[1].z+s[2].y, s[1].w+s[3].y,
				     0.,			0., 	   s[2].z, s[2].w+s[3].z,
				     0.,            0.,            0.,        s[3].w);
		Ss = s;
		float A, B, C, delta, t1, t2;
		A = s[0].x * W.x * W.x + s[0].y * W.x * W.y + s[0].z * W.x * W.z +
								 s[1].y * W.y * W.y + s[1].z * W.y * W.z +
								 					  s[2].z * W.z * W.z;
		B = s[0].x * (V.x * W.x + V.x * W.x) + s[0].y * (V.x * W.y + V.y * W.x) + s[0].z * (V.x * W.z + V.z * W.x) + s[0].w * W.x +
											   s[1].y * (V.y * W.y + V.y * W.y) + s[1].z * (V.y * W.z + V.z * W.y) + s[1].w * W.y +
											   									  s[2].z * (V.z * W.z + V.z * W.z) + s[2].w * W.z;
		C = s[0].x * V.x * V.x + s[0].y * V.x * V.y + s[0].z * V.x * V.z + s[0].w * V.x +
								 s[1].y * V.y * V.y + s[1].z * V.y * V.z + s[1].w * V.y +
								 					  s[2].z * V.z * V.z + s[2].w * V.z +
								 					  					   s[3].w;
		delta = B * B - 4. * A * C;
		if (delta < 0.) {
			t1 = -1.;
			t2 = -1.;
		} else {
			t1 = (-B - sqrt(delta)) / (2. * A);
			t2 = (-B + sqrt(delta)) / (2. * A);
		}
		return vec2(t1, t2);


	    // vec3 Vp = V - S.center;
	    // float delta = dot(W, Vp) * dot(W, Vp) - dot(Vp, Vp) + r * r;
	    // if (delta < 0.) {
	    //     return vec2(-1., -1.);
	    // }
	    // vec2 t;
	    // if (delta == 0.) {
	    //     t = vec2(-dot(W, Vp), -dot(W, Vp));
	    // } else {
	    //     t = vec2(-dot(W, Vp) - sqrt(delta), -dot(W, Vp) + sqrt(delta));
	    // }
	    // return t;
    } else if (S.type == 1) { // cube
	    vec4 Vp = vec4(V, 1.);
	    const int NP = 6;
	    vec4 P[NP];
	    P[0] = vec4(-1., 0., 0., -1.);
	    P[1] = vec4( 1., 0., 0., -1.);
	    P[2] = vec4( 0.,-1., 0., -1.);
	    P[3] = vec4( 0., 1., 0., -1.);
	    P[4] = vec4( 0., 0.,-1., -1.);
	    P[5] = vec4( 0., 0., 1., -1.);
	    float PV, t;
	    float tMin = -1000., tMax = 1000.;
	    bool miss = false;
	    for (int i = 0; i < NP; i++) {
	    	P[i] = P[i] * S.imatrix;
	    	PV = dot(P[i], Vp);
	    	t = -PV / dot(P[i], vec4(W, 0.));
	    	if (PV > 0.) {
	    		if (t < 0.) { // case 1
	    			miss = true;
	    		} else if (t > 0.) { // case 2
	    			if (t > tMin) {
	    				frontSurfaceNormal = P[i].xyz;
	    				tMin = t;
	    			}
	    		}
	    	} else if (PV < 0.) {
	    		if (t > 0.) { // case 3
	    			if (t < tMax) {
	    				rearSurfaceNormal = P[i].xyz;
	    				tMax = t;
	    			}
	    		}
	    	}
	    }
	    if (!miss && tMin < tMax) {
	    	return vec2(tMin, tMax);
	    } else {
	    	return vec2(-1., -1.);
	    }
    } else if (S.type == 2) { // octahedron
    	vec4 Vp = vec4(V, 1.);
    	const int NP = 8;
	    vec4 P[NP];
    	float r3 = 1. / sqrt(3.);
	    P[0] = vec4(-r3, -r3, -r3, -1);
	    P[1] = vec4( r3, -r3, -r3, -1);
	    P[2] = vec4(-r3,  r3, -r3, -1);
	    P[3] = vec4( r3,  r3, -r3, -1);
	    P[4] = vec4(-r3, -r3,  r3, -1);
	    P[5] = vec4( r3, -r3,  r3, -1);
	    P[6] = vec4(-r3,  r3,  r3, -1);
	    P[7] = vec4( r3,  r3,  r3, -1);
	    float PV, t;
	    float tMin = -1000., tMax = 1000.;
	    bool miss = false;
	    for (int i = 0; i < NP; i++) {
	    	P[i] = P[i] * S.imatrix;
	    	PV = dot(P[i], Vp);
	    	t = -PV / dot(P[i], vec4(W, 0.));
	    	if (PV > 0.) {
	    		if (t < 0.) { // case 1
	    			miss = true;
	    		} else if (t > 0.) { // case 2
	    			if (t > tMin) {
	    				frontSurfaceNormal = P[i].xyz;
	    				tMin = t;
	    			}
	    		}
	    	} else if (PV < 0.) {
	    		if (t > 0.) { // case 3
	    			if (t < tMax) {
	    				rearSurfaceNormal = P[i].xyz;
	    				tMax = t;
	    			}
	    		}
	    	}
	    }
	    if (!miss && tMin < tMax) {
	    	return vec2(tMin, tMax);
	    } else {
	    	return vec2(-1., -1.);
	    }
    } else if (S.type == 3) { // cylinder
//	    float tMin = -1000., tMax = 1000.;
//	    vec4 Vp = vec4(V, 1.);
//
//    	mat4 s = mat4(1.,0.,0.,0., 0.,1.,0.,0., 0.,0.,0.,0., 0.,0.,0.,-1.);
//    	s = transpose(inverse(S.matrix)) * s * inverse(S.matrix);
//		s = mat4(s[0].x, s[0].y+s[1].x, s[0].z+s[2].x, s[0].w+s[3].x,
//				     0.,        s[1].y, s[1].z+s[2].y, s[1].w+s[3].y,
//				     0.,			0., 	   s[2].z, s[2].w+s[3].z,
//				     0.,            0.,            0.,        s[3].w);
//		Sc = s;
//		float A, B, C, delta, t1, t2;
//		A = s[0].x * W.x * W.x + s[0].y * W.x * W.y + s[0].z * W.x * W.z +
//								 s[1].y * W.y * W.y + s[1].z * W.y * W.z +
//								 					  s[2].z * W.z * W.z;
//		B = s[0].x * (V.x * W.x + V.x * W.x) + s[0].y * (V.x * W.y + V.y * W.x) + s[0].z * (V.x * W.z + V.z * W.x) + s[0].w * W.x +
//											   s[1].y * (V.y * W.y + V.y * W.y) + s[1].z * (V.y * W.z + V.z * W.y) + s[1].w * W.y +
//											   									  s[2].z * (V.z * W.z + V.z * W.z) + s[2].w * W.z;
//		C = s[0].x * V.x * V.x + s[0].y * V.x * V.y + s[0].z * V.x * V.z + s[0].w * V.x +
//								 s[1].y * V.y * V.y + s[1].z * V.y * V.z + s[1].w * V.y +
//								 					  s[2].z * V.z * V.z + s[2].w * V.z +
//								 					  					   s[3].w;
//		delta = B * B - 4. * A * C;
//		if (delta < 0.) {
//			t1 = -1.;
//			t2 = -1.;
//		} else {
//			t1 = (-B - sqrt(delta)) / (2. * A);
//			t2 = (-B + sqrt(delta)) / (2. * A);
//			tMin = t1;
//			tMax = t2;
//		}
//
//		const int NP = 2;
//	    vec4 P[NP];
//	    P[0] = vec4(0., 0., -1., -1.);
//	    P[1] = vec4(0., 0.,  1., -1.);
//	    float PV, t;
//	    bool miss = false;
//	    for (int i = 0; i < NP; i++) {
//	    	P[i] = P[i] * S.imatrix;
//	    	PV = dot(P[i], Vp);
//	    	t = -PV / dot(P[i], vec4(W, 0.));
//	    	if (PV > 0.) {
//	    		if (t < 0.) { // case 1
//	    			miss = true;
//	    		} else if (t > 0.) { // case 2
//	    			if (t > tMin) {
//	    				frontSurfaceNormal = P[i].xyz;
//	    				tMin = t;
//	    			}
//	    		}
//	    	} else if (PV < 0.) {
//	    		if (t > 0.) { // case 3
//	    			if (t < tMax) {
//	    				rearSurfaceNormal = P[i].xyz;
//	    				tMax = t;
//	    			}
//	    		}
//	    	}
//	    }
//	    if (!miss && tMin <= tMax) {
//	    	return vec2(tMin, tMax);
//	    } else {
//	    	return vec2(-1., -1.);
//	    }
    }
}

// Function that computes the surface normal of a certain shape at a certain point
vec3 computeSurfaceNormal(vec3 P, Shape S) {
	vec3 N = vec3(0., 0., 0.);
	// vec3 Pp = (S.imatrix * vec4(P, 1.)).xyz;
	if (S.type == 0) { // sphere
		// N = normalize(Pp);
		N = P;
		N = normalize(vec3(2. *  Ss[0].x * N.x + Ss[0].y * N.y + Ss[0].z * N.z + Ss[0].w,
											2. * Ss[1].y * N.y + Ss[1].z * N.z + Ss[1].w,
											 			    2. * Ss[2].z * N.z + Ss[2].w));
	} else if (S.type == 1) { // cube
		const int NP = 6;
	    vec4 Pl[NP];
	    Pl[0] = vec4(-1., 0., 0., -1.);
	    Pl[1] = vec4( 1., 0., 0., -1.);
	    Pl[2] = vec4( 0.,-1., 0., -1.);
	    Pl[3] = vec4( 0., 1., 0., -1.);
	    Pl[4] = vec4( 0., 0.,-1., -1.);
	    Pl[5] = vec4( 0., 0., 1., -1.);
	    for (int i = 1; i < NP; i++) {
	    	Pl[i] = Pl[i] * S.imatrix;
	    }
	    vec4 P4 = vec4(P, 1.);
	    float min = 1000.;
      	for (int i = 0; i < NP; i++) {
         	if (abs(dot(P4, Pl[i])) < min){
            	min = abs(dot(P4, Pl[i]));
            	N = Pl[i].xyz;
        	}
      	}
      	N = normalize(N);

		//float m = max(max(abs(Pp).x, abs(Pp).y), abs(Pp).z);
		//for (int i = 0; i < 3; i++) {
		//	if (m == abs(Pp[i])) {
		//		N[i] = Pp[i] / abs(Pp[i]);
		//		break;
		//	}
		//}
	} else if (S.type == 2) { // octahedron
		const int NP = 8;
	    vec4 Pl[NP];
    	float r3 = 1. / sqrt(3.);
	    Pl[0] = vec4(-r3, -r3, -r3, -1);
	    Pl[1] = vec4( r3, -r3, -r3, -1);
	    Pl[2] = vec4(-r3,  r3, -r3, -1);
	    Pl[3] = vec4( r3,  r3, -r3, -1);
	    Pl[4] = vec4(-r3, -r3,  r3, -1);
	    Pl[5] = vec4( r3, -r3,  r3, -1);
	    Pl[6] = vec4(-r3,  r3,  r3, -1);
	    Pl[7] = vec4( r3,  r3,  r3, -1);
	    for (int i = 0; i < NP; i++) {
	    	Pl[i] = Pl[i] * S.imatrix;
	    }
	    vec4 P4 = vec4(P, 1.);
	    float min = 1000.;
      	for (int i = 0; i < NP; i++) {
         	if (abs(dot(P4, Pl[i])) < min){
            	min = abs(dot(P4, Pl[i]));
            	N = Pl[i].xyz;
        	}
      	}
		N = normalize(N);
	} else if (S.type == 3) { // cylinder
//		N = P;
//		N = normalize(vec3(2. *  Sc[0].x * N.x + Sc[0].y * N.y + Sc[0].z * N.z + Sc[0].w,
//											2. * Sc[1].y * N.y + Sc[1].z * N.z + Sc[1].w,
//											 			    2. * Sc[2].z * N.z + Sc[2].w));
//		const int NP = 2;
//	    vec4 Pl[NP];
//	    Pl[0] = vec4(0., 0., -1., -1.);
//	    Pl[1] = vec4(0., 0.,  1., -1.);
//	    for (int i = 0; i < NP; i++) {
//	    	Pl[i] = Pl[i] * S.imatrix;
//	    }
//	    vec4 P4 = vec4(P, 1.);
//		if (abs(dot(P4, Pl[0])) < .01)
//			N = normalize(Pl[0].xyz);
//		if (abs(dot(P4, Pl[1])) < .01)
//			N = normalize(Pl[1].xyz);
	}
	return N;
}


// Function that checks whether the point is in shadow from any other sphere in the scene
bool isInShadow(vec3 P, vec3 L){
    for (int i = 0; i < NS; i++) {
        if (rayShape(P, L, uShapes[i]).x > 0.001) {
            return true;
        }
    }
    return false;
}

// PHONG SHADING
vec3 phongShading(vec3 P, vec3 N, Shape S, Material M) {
	vec3 color = M.ambient;
	vec3 W = normalize(vec3(vPos.xy, -FL));
    vec3 R;
    for (int i = 0; i < NL; i++) {
        R = 2. * dot(N, uLights[i].direction) * N - uLights[i].direction;
        if (!isInShadow(P, uLights[i].direction)) {
            color += uLights[i].color * (M.diffuse * max(0., dot(N, uLights[i].direction)));
            color += uLights[i].color * (M.specular * pow(max(0., dot(-W, R)), M.power));
        }
        color = turbulence(color)*color;
    }
    return color;
}

// compute refraction ray
vec3 refractRay(vec3 W, vec3 N, float indexOfRefraction) {
	vec3 Wc, Ws, Wps, Wpc, Wp;
	Wc = dot(W, N) * N;
	Ws = W - Wc;
	Wps = Ws / indexOfRefraction;
	Wpc = -sqrt(1. - dot(Wps, Wps)) * N;
	Wp = Wpc + Wps;
	return Wp;
}

void main() {
    // RAY TRACE
    vec3 N, P;
    vec3 V = vec3(0., 0., FL);
    vec3 W = normalize(vec3(vPos.xy, -FL));
    float tMin = 1000.;
    float t;
    int Si = -1;
    for (int i = 0; i < NS; i++) {
        t = rayShape(V, W, uShapes[i]).x;
        if (t > 0. && t < tMin) {
            P = V + t * W;
            N = computeSurfaceNormal(P, uShapes[i]);
            tMin = t;
            Si = i;
        }
    }

    // PHONG SHADING
    vec3 color;
    if (Si == -1) {
    	color = BG_COLOR;
    } else  {
    	color = phongShading(P, N, uShapes[Si], uMaterials[Si]);

    	// REFLECTION
    	if (length(uMaterials[Si].reflect) > 0.) {		// if reflection color is any
    														// color other than black
    		vec3 Wp = W - 2. * dot(N, W) * N;
    		tMin = 1000.;
    		Shape S;
    		Material M;
    		vec3 Pp, Np, colorReflect;
    		for (int j = 0; j < NS; j++) {
    			t = rayShape(P, Wp, uShapes[j]).x;		// use only first of the two roots
    			if (t > 0. && t < tMin) {
    				S = uShapes[j];
    				M = uMaterials[j];
    				Pp = P + t * Wp;					// find point on surface of other shape
    				Np = computeSurfaceNormal(Pp, S);	// find surface normal at other shape
    				tMin = t;
    			}
    		}
    		if (tMin < 1000.) {
    			colorReflect = phongShading(Pp, Np, S, M);	// do phong shading at other shape
    			color += colorReflect * uMaterials[Si].reflect;  // tint and add to color
    		}
    	}
	
    	// REFRACTION
    	if (length(uMaterials[Si].transparent) > 0.) { // if transparent color is not black
    		// Compute ray that refracts into the shape
    		vec3 Wp = refractRay(W, N, uMaterials[Si].indexOfRefraction);
    		float tp = rayShape(P - Wp/1000., Wp, uShapes[Si]).y;
	
    		// Compute second refracted ray that emerges back out of the shape
    		vec3 Pp = P - Wp/1000. + tp * Wp;
    		vec3 Np = - computeSurfaceNormal(Pp, uShapes[Si]);
    		vec3 Wpp = refractRay(Wp, Np, 1. / uMaterials[Si].indexOfRefraction);
	
    		// If emergent ray hits any shapes, do Phong shading on nearest one and add to color
    		tMin = 1000.;
    		Shape S;
    		Material M;
    		vec3 Ppp, Npp, colorRefract;
    		for (int j = 0; j < NS; j++) {
    			t = rayShape(Pp, Wpp, uShapes[j]).x;
    			if (t > 0.0001 && t < tMin) {
    				S = uShapes[j];
    				M = uMaterials[j];
    				Ppp = Pp + t * Wpp;					// find point on surface of other shape
    	        	Npp = computeSurfaceNormal(Ppp, S); // find surface normal at other shape
    	        	tMin = t;
    			}
    		}
    		if (tMin < 1000.) {
    			colorRefract = phongShading(Ppp, Npp, S, M);	// do phong shading at other shape
    			color += colorRefract * uMaterials[Si].transparent;  // tint and add to color
    		}
    	}

    }


    fragColor = vec4(sqrt(color), 1.0);
}
