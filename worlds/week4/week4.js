"use strict"

let cursor;

/// Matrix primitives

// has no effect on point
function identity() {
    return [1., 0., 0., 0.,
            0., 1., 0., 0.,
            0., 0., 1., 0.,
            0., 0., 0., 1.];
}

// moves point by a fixed amount
function translate(x, y, z) {
    return [1., 0., 0., 0.,
            0., 1., 0., 0.,
            0., 0., 1., 0.,
            x , y , z , 1.];
}

// rotates point about X axis
function rotateX(theta) {
    return [1., 0., 0., 0.,
            0., Math.cos(theta), Math.sin(theta), 0.,
            0., -Math.sin(theta), Math.cos(theta), 0.,
            0., 0., 0., 1.];
}

// rotates point about Y axis
function rotateY(theta) {
    return [Math.cos(theta), 0., -Math.sin(theta), 0.,
            0., 1., 0., 0.,
            Math.sin(theta), 0.,  Math.cos(theta), 0.,
            0., 0., 0., 1.];
}

// rotates point about Z axis
function rotateZ(theta) {
    return [ Math.cos(theta), Math.sin(theta), 0., 0.,
            -Math.sin(theta), Math.cos(theta), 0., 0.,
            0., 0., 1., 0.,
            0., 0., 0., 1.];
}

// scales point along X,Y,Z axes
function scale(x, y, z) {
    return [x , 0., 0., 0.,
            0., y , 0., 0.,
            0., 0., z , 0.,
            0., 0., 0., 1.];
}

// create perspective effects
function perspective(x, y, z, w) {
    return [1., 0., 0., x,
            0., 1., 0., y,
            0., 0., 1., z,
            0., 0., 0., w];
}

/// Matrix operations
function multiply(m1, m2) {
    let dot = (r, c) => r[0] * c[0] + r[1] * c[1] + r[2] * c[2] + r[3] * c[3];
    let row = (m, i) => [m[i], m[4+i], m[8+i], m[12+i]];
    let col = (m, i) => [m[i*4], m[1+i*4], m[2+i*4], m[3+i*4]];
    return [dot(row(m1, 0), col(m2, 0)), dot(row(m1, 1), col(m2, 0)), dot(row(m1, 2), col(m2, 0)), dot(row(m1, 3), col(m2, 0)),
            dot(row(m1, 0), col(m2, 1)), dot(row(m1, 1), col(m2, 1)), dot(row(m1, 2), col(m2, 1)), dot(row(m1, 3), col(m2, 1)),
            dot(row(m1, 0), col(m2, 2)), dot(row(m1, 1), col(m2, 2)), dot(row(m1, 2), col(m2, 2)), dot(row(m1, 3), col(m2, 2)),
            dot(row(m1, 0), col(m2, 3)), dot(row(m1, 1), col(m2, 3)), dot(row(m1, 2), col(m2, 3)), dot(row(m1, 3), col(m2, 3))];
}

function transpose(m) {
    let m_t = [];
    for (var i = 0; i < 4; i++) {
        for(var j = 0; j < 4; j++) {
            m_t[i*4+j] = m[i+j*4];
        }
    }
    return m_t;
}

async function setup(state) {
    let libSources = await MREditor.loadAndRegisterShaderLibrariesForLiveEditing(gl, "libs", [
        { 
            key : "pnoise", path : "shaders/noise.glsl", foldDefault : true
        },
        {
            key : "sharedlib1", path : "shaders/sharedlib1.glsl", foldDefault : true
        },      
    ]);

    if (!libSources) {
        throw new Error("Could not load shader library");
    }

    // load vertex and fragment shaders from the server, register with the editor
    let shaderSource = await MREditor.loadAndRegisterShaderForLiveEditing(
        gl,
        "mainShader",
        { 
            onNeedsCompilation : (args, libMap, userData) => {
                const stages = [args.vertex, args.fragment];
                const output = [args.vertex, args.fragment];

                const implicitNoiseInclude = true;
                if (implicitNoiseInclude) {
                    let libCode = MREditor.libMap.get("pnoise");

                    for (let i = 0; i < 2; i += 1) {
                        const stageCode = stages[i];
                        const hdrEndIdx = stageCode.indexOf(';');
                        
                        /*
                        const hdr = stageCode.substring(0, hdrEndIdx + 1);
                        output[i] = hdr + "\n#line 1 1\n" + 
                                    libCode + "\n#line " + (hdr.split('\n').length) + " 0\n" + 
                                    stageCode.substring(hdrEndIdx + 1);
                        console.log(output[i]);
                        */
                        const hdr = stageCode.substring(0, hdrEndIdx + 1);
                        
                        output[i] = hdr + "\n#line 2 1\n" + 
                                    "#include<pnoise>\n#line " + (hdr.split('\n').length + 1) + " 0" + 
                            stageCode.substring(hdrEndIdx + 1);

                        console.log(output[i]);
                    }
                }

                MREditor.preprocessAndCreateShaderProgramFromStringsAndHandleErrors(
                    output[0],
                    output[1],
                    libMap
                );
            },
            onAfterCompilation : (program) => {
                state.program = program;

                gl.useProgram(program);

                state.uCursorLoc       = gl.getUniformLocation(program, 'uCursor');
                state.uModelLoc        = gl.getUniformLocation(program, 'uModel');
                state.uProjLoc         = gl.getUniformLocation(program, 'uProj');
                state.uTimeLoc         = gl.getUniformLocation(program, 'uTime');
                state.uViewLoc         = gl.getUniformLocation(program, 'uView');

                /////////////
                state.cameraLoc        = gl.getUniformLocation(program, 'camera');
                state.screenCenterLoc  = gl.getUniformLocation(program, 'screen_center');

                state.uLightsLoc = [];
                var numLights = 2;
                for (var i = 0; i < numLights; i++) {
                    var strL = 'uLights[';
                    state.uLightsLoc[i] = {};
                    state.uLightsLoc[i].src   = gl.getUniformLocation(program, strL.concat(i.toString(),'].src'));
                    state.uLightsLoc[i].col   = gl.getUniformLocation(program, strL.concat(i.toString(),'].col'));
                }

                state.uMaterialsLoc = [];
                state.uShapesLoc = [];
                var numMaterialsAndShapes = 4;
                for (var i = 0; i < numMaterialsAndShapes; i++) {
                    var strM = 'uMaterials[';
                    var strS = 'uShapes[';
                    state.uMaterialsLoc[i] = {};
                    state.uMaterialsLoc[i].ambient      = gl.getUniformLocation(program, strM.concat(i.toString(),'].ambient'));
                    state.uMaterialsLoc[i].diffuse      = gl.getUniformLocation(program, strM.concat(i.toString(),'].diffuse'));
                    state.uMaterialsLoc[i].specular     = gl.getUniformLocation(program, strM.concat(i.toString(),'].specular'));
                    state.uMaterialsLoc[i].power        = gl.getUniformLocation(program, strM.concat(i.toString(),'].power'));
                    state.uMaterialsLoc[i].reflect      = gl.getUniformLocation(program, strM.concat(i.toString(),'].reflect'));
                    state.uMaterialsLoc[i].transparent  = gl.getUniformLocation(program, strM.concat(i.toString(),'].transparent'));
                    state.uMaterialsLoc[i].indexOfRefraction    = gl.getUniformLocation(program, strM.concat(i.toString(),'].indexOfRefraction'));

                    state.uShapesLoc[i] = {};
                    state.uShapesLoc[i].NSurf   = gl.getUniformLocation(program, strS.concat(i.toString(),'].NSurf'));
                    state.uShapesLoc[i].matrix  = gl.getUniformLocation(program, strS.concat(i.toString(),'].matrix'));
                    state.uShapesLoc[i].imatrix = gl.getUniformLocation(program, strS.concat(i.toString(),'].imatrix'));
                    state.uShapesLoc[i].surfLoc = [];
                    for (var j = 0; j < 8; j++) {
                        state.uShapesLoc[i].surfLoc[j] = gl.getUniformLocation(program, strS.concat(i.toString(),'].surf[',j.toString(),']'));
                        console.log(strS.concat(i.toString(),'].surf[',j.toString(),']'));
                    }
                }
            } 
        },
        {
            paths : {
                vertex   : "shaders/vertex.vert.glsl",
                fragment : "shaders/fragment.frag.glsl"
            },
            foldDefault : {
                vertex   : true,
                fragment : false
            }
        }
    );

    cursor = ScreenCursor.trackCursor(MR.getCanvas());

    if (!shaderSource) {
        throw new Error("Could not load shader");
    }


    // Create a square as a triangle strip consisting of two triangles
    state.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,0, 1,1,0, -1,-1,0, 1,-1,0]), gl.STATIC_DRAW);

    // Assign aPos attribute to each vertex
    let aPos = gl.getAttribLocation(state.program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
}

// I HAVE IMPLEMENTED inverse() FOR YOU. FOR HOMEWORK, YOU WILL STILL NEED TO IMPLEMENT:
// identity(), translate(x,y,z), rotateX(a), rotateY(a) rotateZ(a), scale(x,y,z), multiply(A,B)

let inverse = src => {
  let dst = [], det = 0, cofactor = (c, r) => {
     let s = (i, j) => src[c+i & 3 | (r+j & 3) << 2];
     return (c+r & 1 ? -1 : 1) * ( (s(1,1) * (s(2,2) * s(3,3) - s(3,2) * s(2,3)))
                                 - (s(2,1) * (s(1,2) * s(3,3) - s(3,2) * s(1,3)))
                                 + (s(3,1) * (s(1,2) * s(2,3) - s(2,2) * s(1,3))) );
  }
  for (let n = 0 ; n < 16 ; n++) dst.push(cofactor(n >> 2, n & 3));
  for (let n = 0 ; n <  4 ; n++) det += src[n] * dst[n << 2];
  for (let n = 0 ; n < 16 ; n++) dst[n] /= det;
  return dst;
}

// NOTE: t is the elapsed time since system start in ms, but
// each world could have different rules about time elapsed and whether the time
// is reset after returning to the world
function onStartFrame(t, state) {

    let tStart = t;
    if (!state.tStart) {
        state.tStart = t;
        state.time = t;
    }

    let cursorValue = () => {
       let p = cursor.position(), canvas = MR.getCanvas();
       return [ p[0] / canvas.clientWidth * 2 - 1, 1 - p[1] / canvas.clientHeight * 2, p[2] ];
    }

    tStart = state.tStart;

    let now = (t - tStart);
    // different from t, since t is the total elapsed time in the entire system, best to use "state.time"
    state.time = now;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let time = now / 1000;

    gl.uniform3fv(state.uCursorLoc     , cursorValue());
    gl.uniform1f (state.uTimeLoc       , time);


    ////////////
    gl.uniform3fv(state.cameraLoc, [0., 0., 5.]);
    gl.uniform3fv(state.screenCenterLoc, [0., 0., 0.]);

    // Lights
    gl.uniform3fv(state.uLightsLoc[0].src, [2.5,2.5,.5]);
    gl.uniform3fv(state.uLightsLoc[0].col, [.7,.8,.5]);

    gl.uniform3fv(state.uLightsLoc[1].src, [-2.5,-2.5,.7]);
    gl.uniform3fv(state.uLightsLoc[1].col, [.4,.5,.2]);

    // Materials
    // sphere
    gl.uniform3fv(state.uMaterialsLoc[0].ambient , [.5,.6,.2]);
    gl.uniform3fv(state.uMaterialsLoc[0].diffuse , [.5,.6,.2]);
    gl.uniform3fv(state.uMaterialsLoc[0].specular, [0.,1.,1.]);
    gl.uniform1f (state.uMaterialsLoc[0].power   , 10.);
    gl.uniform3fv(state.uMaterialsLoc[0].reflect , [.3,.3,.3]);
    gl.uniform3fv(state.uMaterialsLoc[0].transparent, [0.5,0.5,0.5]);
    gl.uniform1f (state.uMaterialsLoc[0].indexOfRefraction   , 1.5);

    //cube
    gl.uniform3fv(state.uMaterialsLoc[1].ambient , [0.8,0.6,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[1].diffuse , [0.1,0.8,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[1].specular, [0.2,0.2,0.8]);
    gl.uniform1f (state.uMaterialsLoc[1].power   , 15.);
    gl.uniform3fv(state.uMaterialsLoc[1].reflect , [.2,.2,.2]);
    gl.uniform3fv(state.uMaterialsLoc[1].transparent , [.6,.6,.6]);
    gl.uniform1f (state.uMaterialsLoc[1].indexOfRefraction   , 1.9);

    // cylinder
    gl.uniform3fv(state.uMaterialsLoc[2].ambient , [.1,.1,.1]);
    gl.uniform3fv(state.uMaterialsLoc[2].diffuse , [.5,.7,.2]);
    gl.uniform3fv(state.uMaterialsLoc[2].specular, [.2,.3,.3]);
    gl.uniform1f (state.uMaterialsLoc[2].power   , 15.);
    gl.uniform3fv(state.uMaterialsLoc[2].reflect , [.3,.3,.3]);
    gl.uniform3fv(state.uMaterialsLoc[2].transparent , [.6,.6,.6]);
    gl.uniform1f (state.uMaterialsLoc[2].indexOfRefraction   , 1.2);

    // octahedron
    gl.uniform3fv(state.uMaterialsLoc[3].ambient , [.2,.3,.5]);
    gl.uniform3fv(state.uMaterialsLoc[3].diffuse , [.4,.3,.1]);
    gl.uniform3fv(state.uMaterialsLoc[3].specular, [.3,.3,.8]);
    gl.uniform1f (state.uMaterialsLoc[3].power   , 15.);
    gl.uniform3fv(state.uMaterialsLoc[3].reflect , [.4,.4,.4]);
    gl.uniform3fv(state.uMaterialsLoc[3].transparent , [.1,.1,.1]);
    gl.uniform1f (state.uMaterialsLoc[3].indexOfRefraction   , 1.2);

    // Shapes
    let setMatrix = (loc, mat) => {
      gl.uniformMatrix4fv(loc.matrix, false, mat);
      gl.uniformMatrix4fv(loc.imatrix, false, inverse(mat));
    }

    let T0 = translate( .4,-.4,-.4);
    let T1 = translate(-.4, .4,-.4);
    let T2 = translate(-.4,-.4, .4);
    let T3 = translate( .4, .4,-.4);

    setMatrix(state.uShapesLoc[0], T0);
    setMatrix(state.uShapesLoc[1], T1);
    setMatrix(state.uShapesLoc[2], T2);
    setMatrix(state.uShapesLoc[3], T3);

    /// SPHERE
    gl.uniform1i(state.uShapesLoc[0].NSurf, 1);
    //var M0 = inverse(multiply(rotateY(2*Math.sin(time)), scale(.1,.15*(1.+0.3*Math.sin(time)),.1)));
    var M0 = inverse(scale(1.,1.+0.3*Math.sin(time),1.));
    var r = .1;
    var surf0 = [1., 0., 0., 0.,
                 0., 1., 0., 0.,
                 0., 0., 1., 0.,
                 0., 0., 0., -r];
    surf0 = multiply(transpose(M0), multiply(surf0, M0));
    gl.uniformMatrix4fv(state.uShapesLoc[0].surfLoc[0], false, surf0);


    /// CUBE
    gl.uniform1i(state.uShapesLoc[1].NSurf, 6);
    var r = .2;
    var M1 = inverse(multiply(rotateY(time), rotateZ(time)));
    var surf0 = [0., 0., 0., 1.,
                 0., 0., 0., 0.,
                 0., 0., 0., 0.,
                 0., 0., 0., -r];
    surf0 = multiply(transpose(M1), multiply(surf0, M1));
    gl.uniformMatrix4fv(state.uShapesLoc[1].surfLoc[0], false, surf0);
    var surf1 = [0., 0., 0., -1.,
                 0., 0., 0., 0.,
                 0., 0., 0., 0.,
                 0., 0., 0., -r];
    surf1 = multiply(transpose(M1), multiply(surf1, M1));
    gl.uniformMatrix4fv(state.uShapesLoc[1].surfLoc[1], false, surf1);
    var surf2 = [0., 0., 0., 0.,
                 0., 0., 0., 1.,
                 0., 0., 0., 0.,
                 0., 0., 0., -r];
    surf2 = multiply(transpose(M1), multiply(surf2, M1));
    gl.uniformMatrix4fv(state.uShapesLoc[1].surfLoc[2], false, surf2);
    var surf3 = [0., 0., 0., 0.,
                 0., 0., 0., -1.,
                 0., 0., 0., 0.,
                 0., 0., 0., -r];
    surf3 = multiply(transpose(M1), multiply(surf3, M1));
    gl.uniformMatrix4fv(state.uShapesLoc[1].surfLoc[3], false, surf3);
    var surf4 = [0., 0., 0., 0.,
                 0., 0., 0., 0.,
                 0., 0., 0., 1.,
                 0., 0., 0., -r];
    surf4 = multiply(transpose(M1), multiply(surf4, M1));
    gl.uniformMatrix4fv(state.uShapesLoc[1].surfLoc[4], false, surf4);
    var surf5 = [0., 0., 0., 0.,
                 0., 0., 0., 0.,
                 0., 0., 0., -1.,
                 0., 0., 0., -r];
    surf5 = multiply(transpose(M1), multiply(surf5, M1));
    gl.uniformMatrix4fv(state.uShapesLoc[1].surfLoc[5], false, surf5);


    /// CYLINDER
    gl.uniform1i(state.uShapesLoc[2].NSurf, 3);
    var M2 = inverse(multiply(rotateX(2 * time), rotateY(time)));
    var r = .08;
    var surf0 = [1., 0., 0., 0.,
                 0., 1., 0., 0.,
                 0., 0., 0., 0.,
                 0., 0., 0., -r];
    surf0 = multiply(transpose(M2), multiply(surf0, M2));
    gl.uniformMatrix4fv(state.uShapesLoc[2].surfLoc[0], false, surf0);
    var surf1 = [0., 0., 0., 0.,
                 0., 0., 0., 0.,
                 0., 0., 0., 1.,
                 0., 0., 0., -r];
    surf1 = multiply(transpose(M2), multiply(surf1, M2));
    gl.uniformMatrix4fv(state.uShapesLoc[2].surfLoc[1], false, surf1);
    var surf2 = [0., 0., 0., 0.,
                 0., 0., 0., 0.,
                 0., 0., 0., -1.,
                 0., 0., 0., -r];
    surf2 = multiply(transpose(M2), multiply(surf2, M2));
    gl.uniformMatrix4fv(state.uShapesLoc[2].surfLoc[2], false, surf2);

    /// OCTAHEDRON
    gl.uniform1i(state.uShapesLoc[3].NSurf, 8);
    var r3 = 1. / Math.sqrt(3.);
    var r = .2;
    var M3 = inverse(multiply(rotateZ(1.*Math.sin(time)), rotateX(time)));
    var surf0 = [0., 0., 0., -r3,
                 0., 0., 0., -r3,
                 0., 0., 0., -r3,
                 0., 0., 0., -r];
    surf0 = multiply(transpose(M3), multiply(surf0, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[0], false, surf0);
    var surf1 = [0., 0., 0., -r3,
                 0., 0., 0., -r3,
                 0., 0., 0., +r3,
                 0., 0., 0., -r];
    surf1 = multiply(transpose(M3), multiply(surf1, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[1], false, surf1);
    var surf2 = [0., 0., 0., -r3,
                 0., 0., 0., +r3,
                 0., 0., 0., -r3,
                 0., 0., 0., -r];
    surf2 = multiply(transpose(M3), multiply(surf2, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[2], false, surf2);
    var surf3 = [0., 0., 0., -r3,
                 0., 0., 0., +r3,
                 0., 0., 0., +r3,
                 0., 0., 0., -r];
    surf3 = multiply(transpose(M3), multiply(surf3, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[3], false, surf3);
    var surf4 = [0., 0., 0., +r3,
                 0., 0., 0., -r3,
                 0., 0., 0., -r3,
                 0., 0., 0., -r];
    surf4 = multiply(transpose(M3), multiply(surf4, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[4], false, surf4);
    var surf5 = [0., 0., 0., +r3,
                 0., 0., 0., -r3,
                 0., 0., 0., +r3,
                 0., 0., 0., -r];
    surf5 = multiply(transpose(M3), multiply(surf5, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[5], false, surf5);
    var surf6 = [0., 0., 0., +r3,
                 0., 0., 0., +r3,
                 0., 0., 0., -r3,
                 0., 0., 0., -r];
    surf6 = multiply(transpose(M3), multiply(surf6, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[6], false, surf6);
    var surf7 = [0., 0., 0., +r3,
                 0., 0., 0., +r3,
                 0., 0., 0., +r3,
                 0., 0., 0., -r];
    surf7 = multiply(transpose(M3), multiply(surf7, M3));
    gl.uniformMatrix4fv(state.uShapesLoc[3].surfLoc[7], false, surf7);



    gl.enable(gl.DEPTH_TEST);
}

function onDraw(t, projMat, viewMat, state, eyeIdx) {
    const sec = state.time / 1000;

    const my = state;
  
    gl.uniformMatrix4fv(my.uModelLoc, false, new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-1,1]));
    gl.uniformMatrix4fv(my.uViewLoc, false, new Float32Array(viewMat));
    gl.uniformMatrix4fv(my.uProjLoc, false, new Float32Array(projMat));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function onEndFrame(t, state) {
}

export default function main() {
    const def = {
        name         : 'week4',
        setup        : setup,
        onStartFrame : onStartFrame,
        onEndFrame   : onEndFrame,
        onDraw       : onDraw,
    };

    return def;
}
