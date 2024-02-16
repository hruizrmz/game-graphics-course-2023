import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, vec4} from "../node_modules/gl-matrix/esm/index.js";

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
        outColor = texture(tex, v_uv);
    }
`;

// language=GLSL
let vertexShader = `
    #version 300 es
            
    uniform float time;
    uniform mat4 viewProjectionMatrix;
    uniform mat4 modelMatrix;
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;
        
    out vec2 v_uv;
    
    void main()
    {
        vec4 worldPosition = modelMatrix * position;
        gl_Position = viewProjectionMatrix * worldPosition;               
        v_uv = uv;
    }
`;

let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());

let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();

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

function draw(timems) {
    let time = timems / 1000;

    mat4.perspective(projMatrix, Math.PI / 2, app.width / app.height, 0.1, 100.0);
    let camPos = vec3.rotateY(vec3.create(), vec3.fromValues(0, 0.5, 4), vec3.fromValues(0, 0, 0), time * 0.05);
    mat4.lookAt(viewMatrix, camPos, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

    mat4.scale(modelMatrix, modelMatrix, vec3.fromValues(0.2, 0.2, 0.2));
    mat4.fromTranslation(modelMatrix, vec3.fromValues(-2, 0, 0));

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);

    app.enable(PicoGL.DEPTH_TEST);
    app.enable(PicoGL.CULL_FACE);
    drawCall.uniform("modelMatrix", modelMatrix);
    drawCall.uniform("viewProjectionMatrix", modelViewProjectionMatrix);
    drawCall.draw();

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
