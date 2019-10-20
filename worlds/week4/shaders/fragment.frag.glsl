#version 300 es        // NEWER VERSION OF GLSL
precision highp float; // HIGH PRECISION FLOATS

uniform vec3  uCursor; // CURSOR: xy=pos, z=mouse up/down
uniform float uTime;   // TIME, IN SECONDS
in vec3 vPos;          // POSITION IN IMAGE
out vec4 fragColor;    // RESULT WILL GO HERE

const int NL = 2; // Number of light sources
//const int NM = 4; // Number of materials
const int NS = 4; // Number of shapes
const int MAX_NSurf = 8; // Maximum number of surfaces in a shape

struct Light {
	vec3 src;
	vec3 col;
};

struct Ray {
	vec3 src;
	vec3 dir;
};

struct Material {
	vec3  ambient;
	vec3  diffuse;
	vec3  specular;
	float power;
	vec3  reflect; 			 // Reflection color. Black means no reflection.
	vec3  transparent;       // Transparency color. Black means the object is opaque.
    float indexOfRefraction; // Higher value means light will bend more as it refracts.
};

struct Shape {
	int NSurf;
	mat4 surf[MAX_NSurf];
	mat4 matrix;
	mat4 imatrix; // the inverse of above
};

uniform vec3 camera;
uniform vec3 screen_center;
uniform Light uLights[NL];
uniform Material uMaterials[NS];
uniform Shape uShapes[NS];


// Input: source point, destination point
// Ouput: Ray with normalized direction
Ray computeRay(vec3 src, vec3 dest) {
	Ray r;
	r.src = src;
	r.dir = normalize(dest - src);
	return r;
}

vec3 computeSurfaceNormal(vec3 P, Shape S, int iSurf) {
	mat4 surf = S.surf[iSurf];
	vec4 p = vec4(P, 1.) * transpose(S.imatrix);
	return normalize(vec3(2. * surf[0].x * p.x + surf[0].y * p.y + surf[0].z * p.z + surf[0].w,
						  2. * surf[1].y * p.y + surf[1].z * p.z + surf[1].w,
						  2. * surf[2].z * p.z + surf[2].w));
}


vec4 intersect(Ray r,  Shape s){
    float idx1 = -1., idx2 = -1.; 
    float tmin = -10000., tmax = 10000.;

    vec4 src = vec4(r.src, 1) * transpose(s.imatrix);
    // vec4 src = vec4(r.src, 1);

    float wx = r.dir.x, wy = r.dir.y, wz = r.dir.z; 
    float vx = src[0], vy = src[1], vz = src[2]; 

    for (int i = 0; i < s.NSurf; i++) {
        mat4 sf = s.surf[i];

        float A = sf[0][0]*wx*wx + sf[0][1]*wx*wy + sf[0][2]*wx*wz + 
                  sf[1][1]*wy*wy + sf[1][2]*wy*wz + 
                  sf[2][2]*wz*wz;
        float B = sf[0][0]*(vx*wx + vx*wx) + sf[0][1]*(vx*wy + vy*wx) + sf[0][2]*(vx*wz + vz*wx) + 
                  sf[0][3]*wx + sf[1][1]*(vy*wy + vy*wy) + sf[1][2]*(vy*wz + vz*wy) + sf[1][3]*wy +
                  sf[2][2]*(vz*wz + vz*wz) + sf[2][3]*wz;
        float C = sf[0][0]*vx*vx + sf[0][1]*vx*vy + sf[0][2]*vx*vz + sf[0][3]*vx + 
                  sf[1][1]*vy*vy + sf[1][2]*vy*vz + sf[1][3]*vy + 
                  sf[2][2]*vz*vz + sf[2][3]*vz + sf[3][3];

        if (abs(A) > 1.e-7) {

            float delta = B*B - 4.*A*C;

            if (delta < 0.) {
                return vec4 (-1., -2. , -1., -1.);
            }
            else if (delta > 0.) {
                float r1 = (-B - sqrt(delta)) / (2.*A), r2 = (-B + sqrt(delta)) / (2.*A);
                float t1 = min(r1, r2), t2 = max(r1, r2);
                float outside = dot(src, src * transpose(sf));

                // if outside
                if (outside > 0.) {
                    if (t1 < 0. && t2 < 0.) {
                        return vec4(10000., -10000., -1., -1.);
                    }
                    else {
                        if (t1 > 0. && t1 > tmin) {
                            tmin = t1;
                            idx1 = float(i);
                        }
                        if (t2 > 0. && t2 < tmax) {
                            tmax = t2;
                            idx2 = float(i);
                        }
                    }
                }
                else { // if inside
                    if (t2 > 0. && t2 < tmax) {
                        tmax = t2;
                        idx2 = float(i);
                    }
                }
            }
            else { // delta = 0
                float t = -B / (2.*A);
                // still need outside if-cond 
                float outside = dot(src, src * transpose(sf));
                // if outside
                if (outside > 0.) {
                    if (t < 0.) {
                        return vec4(10000., -10000., -1., -1.);
                    }
                    if (t > tmin) {
                        tmin = t;
                        idx1 = float(i);
                    }
                }
                else {
                    if (t < tmax) {
                        tmax = t;
                        idx2 = float(i);
                    }                
                }
            }
        }
        // A == 0.
        else {
            if(B==0.) continue;
            float outside = dot(src, src * transpose(sf));
            float t = -C/B;
            if (outside > 1.e-7) {
                    if (t < 0.) {
                        return vec4(-1., -2., -1., -1.);
                    }
                    if (t > 0. && t > tmin) {
                        tmin = t;
                        idx1 = float(i);
                    }
                }
                else {
                    if (t > 0. && t < tmax) {
                        tmax = t;
                        idx2 = float(i);
                    }                
                }
        }
    }

    if (idx1 <= -1. && idx2 <= -1.) {
        return vec4(10000., -10000., idx1, idx2);
    }
    return vec4(tmin, tmax, idx1, idx2);

}




// Finds the distance along a ray to a shape
// Output: vec4(tmin, tmax, iSurf1, iSurf2)
vec4 rayShape(Ray R, Shape S) {
	float tmin = -1000., tmax = +1000., iSurf1 = -1., iSurf2 = -1.;
	vec4 V = vec4(R.src, 1.) * transpose(S.imatrix);
	vec4 W = vec4(R.dir, 0.);

	for (int i = 0; i < S.NSurf; i++) {
		mat4 surf = S.surf[i];
		float A, B, C;
		A = surf[0].x * W.x * W.x + surf[0].y * W.x * W.y + surf[0].z * W.x * W.z +
									surf[1].y * W.y * W.y + surf[1].z * W.y * W.z +
								 							surf[2].z * W.z * W.z;
		B = surf[0].x * (V.x * W.x + V.x * W.x) + surf[0].y * (V.x * W.y + V.y * W.x) +
			surf[0].z * (V.x * W.z + V.z * W.x) + surf[0].w * W.x +
			surf[1].y * (V.y * W.y + V.y * W.y) + surf[1].z * (V.y * W.z + V.z * W.y) + surf[1].w * W.y +
			surf[2].z * (V.z * W.z + V.z * W.z) + surf[2].w * W.z;
		C = surf[0].x * V.x * V.x + surf[0].y * V.x * V.y + surf[0].z * V.x * V.z + surf[0].w * V.x +
									surf[1].y * V.y * V.y + surf[1].z * V.y * V.z + surf[1].w * V.y +
								 							surf[2].z * V.z * V.z + surf[2].w * V.z +
								 					  								surf[3].w;
		bool isOutside = dot(V, V * transpose(surf)) > 0.;
		if (abs(A) > .00001) {
			float delta = B * B - 4. * A * C;
			if (delta < 0.) {
				return vec4(-1., -2., -1., -1.);
			}
			if (delta > 0.) {
				float tt1 = (-B - sqrt(delta)) / (2. * A), tt2 = (-B + sqrt(delta)) / (2. * A);
				float t1 = min(tt1, tt2), t2 = max(tt1, tt2);

				if (isOutside) {
					if (t1 < 0. && t2 < 0.) {
					 return vec4(1000., -1000., -1., -1.);
					} else {
						if (t1 > 0. && t1 > tmin) {
							tmin = t1;
							iSurf1 = float(i);
						}
						if (t2 > 0. && t2 < tmax) {
							tmax = t2;
							iSurf2 = float(i);
						}
					}
				} else {
					// isInside
					if (t2 > 0. && t2 < tmax) {
						tmax = t2;
						iSurf2 = float(i);
					}
				}
			} else {
				// delta = 0
				float t = (-B) / (2. * A);
				if (isOutside) {
					if (t < 0.) {
						return vec4(1000., -1000., -1., -1.);
					}
					if (t > tmin) {
						tmin = t;
						iSurf1 = float(i);
					}
				} else {
					// isInside
					if (t < tmax) {
						tmax = t;
						iSurf2 = float(i);
					}
				}
			}
		} else {
			if (B == 0.) continue;
			// A = 0, surf is a half space
			float t = -C / B;
			if (dot(V, V * transpose(surf)) > .00001) {
				if (t < 0.) {
					return vec4(-1., -2., -1., -1.);
				}
				if (t > 0. && t > tmin) {
					tmin = t;
					iSurf1 = float(i);
				}
			} else {
				// isInside
				if (t > 0. && t < tmax) {
					tmax = t;
					iSurf2 = float(i);
				}
			}
		}

		if (iSurf1 <= -1. && iSurf2 <= -1.) {
        	return vec4(1000., -1000., iSurf1, iSurf2);
    	}
		return vec4(tmin, tmax, iSurf1, iSurf2);
	}
}

// Checks whether the point is in shadow from any other sphere in the scene
bool isInShadow(vec3 P, vec3 N, Light L){
	Ray r = computeRay(P + 0.0001 * N, L.src);
    for (int i = 0; i < NS; i++) {
    	vec4 rs = rayShape(r, uShapes[i]);
        if (rs[1] > rs[0] && rs[0] > 0.) {
            return true;
        }
    }
    return false;
}

Ray reflectRay(Ray R, vec3 N) {
	Ray r;
	r.src = R.src;
	r.dir = normalize(2. * dot(N, R.dir) * N - R.dir);
	return r;
}

// compute refraction ray
Ray refractRay(Ray R, vec3 N, float indexOfRefraction) {
	Ray r;
	r.src = R.src + 0.0001 * N;
	vec3 Wc, Ws, Wps, Wpc, Wp;
	Wc = dot(R.dir, N) * N;
	Ws = R.dir - Wc;
	Wps = -Ws / indexOfRefraction;
	Wpc = -sqrt(1. - dot(Wps, Wps)) * N;
	r.dir = Wpc + Wps;
	return r;
}

Ray refract2Ray(Ray R, int iS, int iSurf) {
	Shape S = uShapes[iS];
	float indexOfRefraction = uMaterials[iS].indexOfRefraction;
	vec3 N = computeSurfaceNormal(R.src, S, iSurf);
	Ray r1 = refractRay(R, N, indexOfRefraction);
	vec4 rs = rayShape(r1, S);
	Ray r3;
	if (rs[0] > 0. && rs[1] >= rs[0]) {
		Ray r2;
		r2.src = r1.src + rs[1] * r1.dir;
		r2.dir = -r1.dir;
		vec3 Np = computeSurfaceNormal(r2.src, S, int(rs[3]));
		r3 = refractRay(r2, -Np, 1. / indexOfRefraction);
	}
	return r3;
}

// PHONG SHADING
vec3 phongShading(vec3 P, int iS, int iSurf) {
	Shape S = uShapes[iS];
	Material M = uMaterials[iS];
	vec3 N = computeSurfaceNormal(P, S, iSurf);
	vec3 color = M.ambient;
    for (int i = 0; i < NL; i++) {
        if (!isInShadow(P, N, uLights[i])) {
        	Ray L = computeRay(P, uLights[i].src);
        	Ray E = computeRay(P, camera); // E = -W
        	Ray R = reflectRay(L, N);
            color += uLights[i].col * (M.diffuse * max(0., dot(N, L.dir)));
            float ER = dot(E.dir, R.dir), spec;
            if (ER > 0.) {
            	spec = max(0., exp(M.power * log(ER)));
            } else {
            	spec = 0.;
            }
            color += uLights[i].col * M.specular * spec;
        }
    }
    return color;
}

bool isBehindShape(Light L){
    Ray r = computeRay(camera, L.src); 
    for(int i = 0; i < NS; i++){
        vec4 rs = rayShape(r, uShapes[i]); 
        if(rs[1] > rs[0] && rs[0] > 0. && rs[0] < length(L.src - camera)) {
            return true; 
        }
    }
    return false; 
}

vec3 rayTrace() {
	vec3 color = vec3(0., 0., 0.);
    Ray r = computeRay(camera, screen_center + vec3(vPos.xy, 0.));
    // show light source
    for (int i = 0; i < NL; i++) {
    	if (dot(normalize(uLights[i].src - r.src), r.dir) > .99999) {
    		if (isBehindShape(uLights[i])) continue;
    		color = uLights[i].col;
    		return color;
    	}
    }

    // ray trace to shape
    float tMin = 1000.;
    int iS = -1;
    int iSurf = -1;
    float tmp = 10001.;
    for (int i = 0; i < NS; i++) {
    	//vec4 rs = rayShape(r, uShapes[i]);
    	vec4 rs =  intersect(r, uShapes[i]);

        // if (rs[0] > 0. && rs[1] >= rs[0] && rs[0] < tMin) {
        //     tMin = rs[0];
        //     iS = i;
        //     iSurf = int(rs[2]);
        // }
        if (rs[1] >= rs[0]) {
        	if (rs[0] >= 0.) {
        		tmp = rs[0];
        	}
        	if (tmp < tMin) {
        		tMin = tmp;
        		iS = i;
        		iSurf = int(rs[2]);
        	}
        }
    }

    // phong shading
    if (iS > -1) {
    	vec3 P = r.src + tMin * r.dir;
    	color = phongShading(P, iS, iSurf);
    	vec3 N = computeSurfaceNormal(P, uShapes[iS], iSurf);
    	Ray r_i;

    	/// REFLECTION
    	if (length(uMaterials[iS].reflect) > 0.) {		// if reflection color is any
    														// color other than black
    		r_i.src = P + 0.0001 * N;
    		r_i.dir = -r.dir;
    		Ray r_o = reflectRay(r_i, N);

    		float tMin_o = 1000.;
    		int iS_o = -1;
    		int iSurf_o = -1;
    		for (int j = 0; j < NS; j++) {
    			vec4 rs_o = rayShape(r_o, uShapes[j]);
    			if (rs_o[0] > 0. && rs_o[1] >= rs_o[0] && rs_o[0] < tMin_o) {
    				tMin_o = rs_o[0];
    				iS_o = j;
    				iSurf_o = int(rs_o[2]);
    			}
    		}
    		if (iS_o != -1) {
    			vec3 Pp = r_o.src + tMin_o * r_o.dir;
    			vec3 colorReflect = phongShading(Pp, iS_o, iSurf_o); // do phong shading at other shape
    			color += colorReflect * uMaterials[iS].reflect; // tint and add to color
    		}
    	}
	
    	/// REFRACTION
    	if (length(uMaterials[iS].transparent) > 0.) { // if transparent color is not black
    		Ray r_r = refract2Ray(r_i, iS, iSurf);

			// If emergent ray hits any shapes, do Phong shading on nearest one and add to color
    		float tMin_r = 1000.;
    		int iS_r = -1;
    		int iSurf_r = -1;
    		for (int j = 0; j < NS; j++) {
    			vec4 rs_r = rayShape(r_r, uShapes[j]);
    			if (rs_r[0] > 0. && rs_r[1] >= rs_r[0] && rs_r[0] < tMin_r) {
    				tMin_r = rs_r[0];
    				iS_r = j;
    				iSurf_r = int(rs_r[2]);
    			}
    		}
    		if (iS_r != -1) {
    			vec3 Ppp = r_r.src + tMin_r * r_r.dir;
    			vec3 colorRefract = phongShading(Ppp, iS_r, iSurf_r); // do phong shading at other shape
    			color += colorRefract * uMaterials[iS].transparent; // tint and add to color
    		}
    	}

    	//color = vec3(0., 1., 0.);
    }
    return color;
}

void main() {
	vec3 color = rayTrace();
    fragColor = vec4(sqrt(color), 1.0);
}
