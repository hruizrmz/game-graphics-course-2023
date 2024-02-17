import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, vec4, quat} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, uvs, indices} from "../blender/kuma.js"

// language=GLSL
let fragmentShader = `
    #version 300 es
    precision highp float;
    
    uniform sampler2D tex;    
    
    in vec2 v_uv;
    
    out vec4 outColor;
    
    void main()
    {   
        vec2 invertedUV = vec2(v_uv.x, 1.0 - v_uv.y); // texture was being loaded backwards
        outColor = texture(tex, invertedUV);
    }
`;

// language=GLSL
let vertexShader = `
    #version 300 es
            
    uniform float time;
    uniform mat4 modelMatrix;
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec4 position;
    layout(location=2) in vec2 uv;
        
    out vec2 v_uv;
    
    void main()
    {
        vec4 worldPosition = modelMatrix * position;
        gl_Position = modelViewProjectionMatrix * worldPosition;
        v_uv = uv;
    }
`;

app.enable(PicoGL.DEPTH_TEST)
   .enable(PicoGL.CULL_FACE);

let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());

let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let modelRotation = quat.create();

async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

const tex = await loadTexture("kumaColors.png");
let drawCall = app.createDrawCall(program, vertexArray)
    .texture("tex", app.createTexture2D(tex, tex.width, tex.height, {
        magFilter: PicoGL.LINEAR,
        minFilter: PicoGL.LINEAR,
        maxAnisotropy: 1,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE
    }));

let cameraPosition = vec3.fromValues(0, 0, 100);

// Fixing Kuma rotation + center
quat.fromEuler(modelRotation, 90, 5, 90);
mat4.fromRotationTranslationScale(modelMatrix, modelRotation, vec3.fromValues(0, -3, 0), [0.8, 0.8, 0.8]);

function draw(timems) {
    const time = timems * 0.02;

    mat4.perspective(projMatrix, Math.PI / 7, app.width / app.height, 0.1, 1000.0);
    vec3.rotateY(cameraPosition, vec3.fromValues(0, 0, 80), vec3.fromValues(0, 0, 0), time * 0.02);
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

    //mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);

    drawCall.uniform("time", time);
    drawCall.uniform("modelMatrix", modelMatrix);
    drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);

    app.clear();
    drawCall.draw();

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
