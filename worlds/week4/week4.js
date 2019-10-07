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


                state.uLightsLoc = [];
                var numLights = 2;
                for (var i = 0; i < numLights; i++) {
                    var strL = 'uLights[';
                    state.uLightsLoc[i] = {};
                    state.uLightsLoc[i].direction   = gl.getUniformLocation(program, strL.concat(i.toString(),'].direction'));
                    state.uLightsLoc[i].color       = gl.getUniformLocation(program, strL.concat(i.toString(),'].color'));
                }
                // state.uLightsLoc[0] = {};
                // state.uLightsLoc[0].direction    = gl.getUniformLocation(program, 'uLights[0].direction');
                // state.uLightsLoc[0].color        = gl.getUniformLocation(program, 'uLights[0].color');
                // state.uLightsLoc[1] = {};
                // state.uLightsLoc[1].direction    = gl.getUniformLocation(program, 'uLights[1].direction');
                // state.uLightsLoc[1].color        = gl.getUniformLocation(program, 'uLights[1].color');

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
                    state.uShapesLoc[i].type    = gl.getUniformLocation(program, strS.concat(i.toString(),'].type'));
                    state.uShapesLoc[i].matrix  = gl.getUniformLocation(program, strS.concat(i.toString(),'].matrix'));
                    state.uShapesLoc[i].imatrix = gl.getUniformLocation(program, strS.concat(i.toString(),'].imatrix'));

                    state.uShapesLoc[i].center  = gl.getUniformLocation(program, strS.concat(i.toString(),'].center'));
                    // state.uShapesLoc[i].size    = gl.getUniformLocation(program, strS.concat(i.toString(),'].size'));
                }
                // state.uMaterialsLoc[0] = {};
                // state.uMaterialsLoc[0].ambient   = gl.getUniformLocation(program, 'uMaterials[0].ambient');
                // state.uMaterialsLoc[0].diffuse   = gl.getUniformLocation(program, 'uMaterials[0].diffuse');
                // state.uMaterialsLoc[0].specular = gl.getUniformLocation(program, 'uMaterials[0].specular');
                // state.uMaterialsLoc[0].power     = gl.getUniformLocation(program, 'uMaterials[0].power');
                // state.uMaterialsLoc[0].reflect   = gl.getUniformLocation(program, 'uMaterials[0].reflect');
                // state.uMaterialsLoc[0].transparent   = gl.getUniformLocation(program, 'uMaterials[0].transparent');
                // state.uMaterialsLoc[0].indexOfRefraction     = gl.getUniformLocation(program, 'uMaterials[0].indexOfRefraction');
                // state.uMaterialsLoc[1] = {};
                // state.uMaterialsLoc[1].ambient   = gl.getUniformLocation(program, 'uMaterials[1].ambient');
                // state.uMaterialsLoc[1].diffuse   = gl.getUniformLocation(program, 'uMaterials[1].diffuse');
                // state.uMaterialsLoc[1].specular = gl.getUniformLocation(program, 'uMaterials[1].specular');
                // state.uMaterialsLoc[1].power     = gl.getUniformLocation(program, 'uMaterials[1].power');
                // state.uMaterialsLoc[1].reflect   = gl.getUniformLocation(program, 'uMaterials[1].reflect');
                // state.uMaterialsLoc[1].transparent   = gl.getUniformLocation(program, 'uMaterials[1].transparent');
                // state.uMaterialsLoc[1].indexOfRefraction     = gl.getUniformLocation(program, 'uMaterials[1].indexOfRefraction');
                // state.uMaterialsLoc[2] = {};
                // state.uMaterialsLoc[2].ambient   = gl.getUniformLocation(program, 'uMaterials[2].ambient');
                // state.uMaterialsLoc[2].diffuse   = gl.getUniformLocation(program, 'uMaterials[2].diffuse');
                // state.uMaterialsLoc[2].specular = gl.getUniformLocation(program, 'uMaterials[2].specular');
                // state.uMaterialsLoc[2].power     = gl.getUniformLocation(program, 'uMaterials[2].power');
                // state.uMaterialsLoc[2].reflect   = gl.getUniformLocation(program, 'uMaterials[2].reflect');
                // state.uMaterialsLoc[2].transparent   = gl.getUniformLocation(program, 'uMaterials[2].transparent');
                // state.uMaterialsLoc[2].indexOfRefraction     = gl.getUniformLocation(program, 'uMaterials[2].indexOfRefraction');
                
                // state.uShapesLoc[0] = {};
                // state.uShapesLoc[0].type     = gl.getUniformLocation(program, 'uShapes[0].type');
                // state.uShapesLoc[0].center   = gl.getUniformLocation(program, 'uShapes[0].center');
                // state.uShapesLoc[0].size = gl.getUniformLocation(program, 'uShapes[0].size');
                // state.uShapesLoc[1] = {};
                // state.uShapesLoc[1].type     = gl.getUniformLocation(program, 'uShapes[1].type');
                // state.uShapesLoc[1].center   = gl.getUniformLocation(program, 'uShapes[1].center');
                // state.uShapesLoc[1].size = gl.getUniformLocation(program, 'uShapes[1].size');
                // state.uShapesLoc[2] = {};
                // state.uShapesLoc[2].type     = gl.getUniformLocation(program, 'uShapes[2].type');
                // state.uShapesLoc[2].center   = gl.getUniformLocation(program, 'uShapes[2].center');
                // state.uShapesLoc[2].size = gl.getUniformLocation(program, 'uShapes[2].size');
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



    gl.uniform3fv(state.uLightsLoc[0].direction , [.5,.5,.6]);
    gl.uniform3fv(state.uLightsLoc[0].color     , [.3,.3,.3]);
    gl.uniform3fv(state.uLightsLoc[1].direction , [-.5,-.5,.7]);
    gl.uniform3fv(state.uLightsLoc[1].color     , [.2,.2,.2]);

    // gl.uniform3fv(state.uMaterialsLoc[0].ambient , [.0001,.0001,.0001]);
    // gl.uniform3fv(state.uMaterialsLoc[0].diffuse , [.0001,.0001,.0001]);
    // gl.uniform3fv(state.uMaterialsLoc[0].specular, [.8,.8,.8]);
    // gl.uniform1f (state.uMaterialsLoc[0].power   , 10.);
    // gl.uniform3fv(state.uMaterialsLoc[0].reflect , [.9,.9,.9]);
    // gl.uniform3fv(state.uMaterialsLoc[0].transparent , [1.,1.,1.]);
    // gl.uniform1f (state.uMaterialsLoc[0].indexOfRefraction   , 1.7);

    gl.uniform3fv(state.uMaterialsLoc[0].ambient , [0.8,0.6,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[0].diffuse , [0.1,0.8,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[0].specular, [0.2,0.2,0.8]);
    gl.uniform1f (state.uMaterialsLoc[0].power   , 15.);
    gl.uniform3fv(state.uMaterialsLoc[0].reflect , [.8,.7,.6]);
    gl.uniform3fv(state.uMaterialsLoc[0].transparent , [.6,.6,.6]);
    gl.uniform1f (state.uMaterialsLoc[0].indexOfRefraction   , 1.2);

    gl.uniform3fv(state.uMaterialsLoc[1].ambient , [0.8,0.6,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[1].diffuse , [0.1,0.8,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[1].specular, [0.2,0.2,0.8]);
    gl.uniform1f (state.uMaterialsLoc[1].power   , 15.);
    gl.uniform3fv(state.uMaterialsLoc[1].reflect , [.8,.7,.6]);
    gl.uniform3fv(state.uMaterialsLoc[1].transparent , [.6,.6,.6]);
    gl.uniform1f (state.uMaterialsLoc[1].indexOfRefraction   , 1.2);

    gl.uniform3fv(state.uMaterialsLoc[2].ambient , [0.8,0.6,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[2].diffuse , [0.1,0.8,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[2].specular, [0.2,0.2,0.8]);
    gl.uniform1f (state.uMaterialsLoc[2].power   , 15.);
    gl.uniform3fv(state.uMaterialsLoc[2].reflect , [.8,.7,.6]);
    gl.uniform3fv(state.uMaterialsLoc[2].transparent , [.6,.6,.6]);
    gl.uniform1f (state.uMaterialsLoc[2].indexOfRefraction   , 1.2);

    gl.uniform3fv(state.uMaterialsLoc[3].ambient , [0.8,0.6,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[3].diffuse , [0.1,0.8,0.8]);
    gl.uniform3fv(state.uMaterialsLoc[3].specular, [0.2,0.2,0.8]);
    gl.uniform1f (state.uMaterialsLoc[3].power   , 15.);
    gl.uniform3fv(state.uMaterialsLoc[3].reflect , [.8,.7,.6]);
    gl.uniform3fv(state.uMaterialsLoc[3].transparent , [.1,.1,.1]);
    gl.uniform1f (state.uMaterialsLoc[3].indexOfRefraction   , 1.2);

    // gl.uniform3fv(state.uMaterialsLoc[2].ambient , [.9,.5,.1]);
    // gl.uniform3fv(state.uMaterialsLoc[2].diffuse , [.5,.7,.2]);
    // gl.uniform3fv(state.uMaterialsLoc[2].specular, [.7,.3,.3]);
    // gl.uniform1f (state.uMaterialsLoc[2].power   , 5.);
    // gl.uniform3fv(state.uMaterialsLoc[2].reflect , [.4,.5,.9]);
    // gl.uniform3fv(state.uMaterialsLoc[2].transparent , [.3,.3,.3]);
    // gl.uniform1f (state.uMaterialsLoc[2].indexOfRefraction   , 1.2);

    // gl.uniform3fv(state.uMaterialsLoc[3].ambient , [.7,.3,.5]);
    // gl.uniform3fv(state.uMaterialsLoc[3].diffuse , [.8,.3,.9]);
    // gl.uniform3fv(state.uMaterialsLoc[3].specular, [.3,.3,.8]);
    // gl.uniform1f (state.uMaterialsLoc[3].power   , 10.);
    // gl.uniform3fv(state.uMaterialsLoc[3].reflect , [.6,.3,.9]);
    // gl.uniform3fv(state.uMaterialsLoc[3].transparent , [.7,.7,.7]);
    // gl.uniform1f (state.uMaterialsLoc[3].indexOfRefraction   , 1.3);

    // gl.uniform3fv(state.uMaterialsLoc[4].ambient , [.2,.2,.2]);
    // gl.uniform3fv(state.uMaterialsLoc[4].diffuse , [.1,.3,.2]);
    // gl.uniform3fv(state.uMaterialsLoc[4].specular, [.5,.5,.5]);
    // gl.uniform1f (state.uMaterialsLoc[4].power   , 30.);
    // gl.uniform3fv(state.uMaterialsLoc[4].reflect , [.8,.2,.3]);
    // gl.uniform3fv(state.uMaterialsLoc[4].transparent , [.6,.6,.6]);
    // gl.uniform1f (state.uMaterialsLoc[4].indexOfRefraction   , 1.7);




    const SPHERE = 0, CUBE = 1, OCTAHEDRON = 2, CYLINDER = 3;


    let setMatrix = (loc, mat) => {
      gl.uniformMatrix4fv(loc['matrix' ], false, mat);
      gl.uniformMatrix4fv(loc['imatrix'], false, inverse(mat));
    }

    let M0 = multiply(translate( .4,-.4,-.4), multiply(rotateX(-.5), scale(.1,.2,.1)));
    let M1 = multiply(translate(-.4, .4,-.4), multiply(rotateY(2*Math.sin(time)), scale(.1,.15*(1.+0.3*Math.sin(time)),.1)));
    let M2 = multiply(translate(-.4,-.4, .4), multiply(rotateZ(1*Math.sin(time)), scale(.1,.1,.1)));
    let M3 = multiply(translate( .4, .4,-.4), multiply(multiply(rotateY(1),
                                                                rotateZ(1)), scale(.1*(1.+0.3*Math.sin(time)),.1,.2)));
    gl.uniform1i(state.uShapesLoc[0].type, CYLINDER);
    gl.uniform1i(state.uShapesLoc[1].type, SPHERE);
    gl.uniform1i(state.uShapesLoc[2].type, OCTAHEDRON);
    gl.uniform1i(state.uShapesLoc[3].type, CUBE);

    setMatrix(state.uShapesLoc[0], M0);
    setMatrix(state.uShapesLoc[1], M1);
    setMatrix(state.uShapesLoc[2], M2);
    setMatrix(state.uShapesLoc[3], M3);

    // gl.uniform3fv(state.uShapesLoc[0].center, [ .4,-.4,-.4]);
    // gl.uniform3fv(state.uShapesLoc[1].center, [-.4, .4,-.4]);
    // gl.uniform3fv(state.uShapesLoc[2].center, [-.4,-.4, .4]);
    // gl.uniform3fv(state.uShapesLoc[3].center, [ .4, .4,-.4]);

    // gl.uniform1i (state.uShapesLoc[0].type  , 0);
    // gl.uniform3fv(state.uShapesLoc[0].center, [0.,0.,0.]);
    // gl.uniform1f (state.uShapesLoc[0].size  , .5);

    // // gl.uniform1i (state.uShapesLoc[1].type  , 1);
    // gl.uniform3fv(state.uShapesLoc[1].center, [0.6*Math.sin(time-1.), 0.6*Math.sin(time-1.), 0.6*Math.cos(time-1.)]);
    // gl.uniform1f (state.uShapesLoc[1].size  , .2);

    // // gl.uniform1i (state.uShapesLoc[2].type  , 1);
    // gl.uniform3fv(state.uShapesLoc[2].center, [0.6*Math.sin(time+3.0), 0.6*Math.sin(time+3.0), 0.6*Math.cos(time+3.0)]);
    // gl.uniform1f (state.uShapesLoc[2].size  , .2);

    // // gl.uniform1i (state.uShapesLoc[3].type  , 2);
    // gl.uniform3fv(state.uShapesLoc[3].center, [-0.7*Math.sin(time+2.0), 0.7*Math.sin(time+2.0), 0.7*Math.cos(time+2.0)]);
    // gl.uniform1f (state.uShapesLoc[3].size  , .2);

    // gl.uniform1i (state.uShapesLoc[4].type  , 2);
    // gl.uniform3fv(state.uShapesLoc[4].center, [-0.8*Math.sin(time),0.8*Math.sin(time),0.8*Math.cos(time)]);
    // gl.uniform1f (state.uShapesLoc[4].size  , .2);









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
