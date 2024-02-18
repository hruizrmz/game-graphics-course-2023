import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat3, mat4, vec2, vec3, vec4, quat} from "../node_modules/gl-matrix/esm/index.js";

// ******************************************************
// **                       Data                       **
// ******************************************************

import {positions, normals, uvs, indices} from "../blender/kuma.js"
import {positions as planePositions, uvs as planeUvs, indices as planeIndices} from "../blender/plane.js"
import {positions as spherePositions, uvs as sphereUvs, indices as sphereIndices} from "../blender/sphere.js"

// ******************************************************
// **               Light configuration                **
// ******************************************************

let baseColor = vec3.fromValues(1.0, 1.0, 1.0); // white base
let ambientLightColor = vec3.fromValues(0.98, 0.27, 0.85); // pink ambience
let numberOfPointLights = 2;
let pointLightColors = [vec3.fromValues(0.62, 0.41, 0.7), vec3.fromValues(1.0, 1.0, 1.0)]; // light violet layered with white
let pointLightInitialPositions = [vec3.fromValues(10, -5, 10), vec3.fromValues(20, 20, 0)];
let pointLightPositions = [vec3.create(), vec3.create()];

// language=GLSL
let lightCalculationShader = `
    uniform vec3 cameraPosition;
    uniform vec3 baseColor;    

    uniform vec3 ambientLightColor;    
    uniform vec3 lightColors[${numberOfPointLights}];        
    uniform vec3 lightPositions[${numberOfPointLights}];
    
    // This function calculates light reflection using Phong reflection model (ambient + diffuse + specular)
    vec4 calculateLights(vec3 normal, vec3 position) {
        float ambientIntensity = 0.5;
        float diffuseIntensity = 0.6;
        float specularIntensity = 0.0;
        float specularPower = 20.0;
        float metalness = 0.0;

        vec3 viewDirection = normalize(cameraPosition.xyz - position);
        vec3 color = baseColor * ambientLightColor * ambientIntensity;
                
        for (int i = 0; i < lightPositions.length(); i++) {
            vec3 lightDirection = normalize(lightPositions[i] - position);
            
            // Lambertian reflection (ideal diffuse of matte surfaces) is also a part of Phong model                        
            float diffuse = max(dot(lightDirection, normal), 0.0);                                    
            color += baseColor * lightColors[i] * diffuse * diffuseIntensity;

            // Blinn-Phong improved specular highlight
            float specular = pow(max(dot(normalize(lightDirection + viewDirection), normal), 0.0), specularPower);
            color += mix(vec3(1.0), baseColor, metalness) * lightColors[i] * specular * specularIntensity;
        }
        return vec4(color, 1.0);
    }
`;

// ******************************************************
// **                 Kuma Processing                  **
// ******************************************************

// language=GLSL
let fragmentShader = `
    #version 300 es
    precision highp float;
    ${lightCalculationShader}

    in vec3 vPosition;    
    in vec3 vNormal;
    in vec3 v_viewDir;
    
    uniform samplerCube cubemap;
    uniform sampler2D tex;

    out vec4 outColor;

    in vec2 v_uvBase;
    in vec2 v_uvCubemap;
    
    void main()
    {
        vec3 reflectedDir = reflect(v_viewDir, normalize(vNormal));
        vec2 invertedUV = vec2(v_uvBase.x, 1.0 - v_uvBase.y); // texture was being loaded backwards
        vec4 baseColor = texture(tex, invertedUV);
        
        vec4 cubemapColor = texture(cubemap, reflectedDir);
        cubemapColor = clamp(cubemapColor, 0.1, 1.0);
        
        // Phong shading (per-fragment)
        outColor = mix(baseColor, cubemapColor, 0.2) * calculateLights(normalize(vNormal), vPosition);
    }
`;

// language=GLSL
let vertexShader = `
    #version 300 es

    uniform mat4 modelMatrix;
    uniform mat4 modelViewProjectionMatrix;
    uniform mat3 normalMatrix;
    uniform vec3 cameraPosition;
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;

    out vec3 vPosition;    
    out vec3 vNormal;
    out vec3 v_viewDir;
        
    out vec2 v_uvBase;
    out vec2 v_uvCubemap;
    
    void main()
    {
        gl_Position = modelViewProjectionMatrix * position;

        vPosition = position.xyz;
        vNormal = normalMatrix * normal;
        v_viewDir = (modelMatrix * position).xyz - cameraPosition;

        v_uvBase = uv;
    }
`;

// ******************************************************
// **              Reflection Processing               **
// ******************************************************

// language=GLSL
let mirrorFragmentShader = `
    #version 300 es
    precision highp float;
    
    uniform sampler2D reflectionTex;
    uniform sampler2D distortionMap;
    uniform vec2 screenSize;
    
    in vec2 v_uv;        
        
    out vec4 outColor;
    
    void main()
    {                        
        vec2 screenPos = gl_FragCoord.xy / screenSize;     
        screenPos.x += (texture(distortionMap, v_uv).r - 0.5) * 0.1;
        outColor = texture(reflectionTex, screenPos);
    }
`;

// language=GLSL
let mirrorVertexShader = `
    #version 300 es
            
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec4 position;   
    layout(location=1) in vec2 uv;
    
    out vec2 v_uv;
        
    void main()
    {
        v_uv = uv;
        vec4 pos = position;
        pos.xz *= 1.5;
        gl_Position = modelViewProjectionMatrix * pos;
    }
`;

// ******************************************************
// **                Skybox Processing                 **
// ******************************************************

// language=GLSL
let skyboxFragmentShader = `
    #version 300 es
    precision mediump float;
    
    uniform samplerCube cubemap;
    uniform mat4 viewProjectionInverse;
    in vec4 v_position;
    
    out vec4 outColor;
    
    void main() {
        vec4 t = viewProjectionInverse * v_position;
        outColor = texture(cubemap, normalize(t.xyz / t.w));
    }
`;

// language=GLSL
let skyboxVertexShader = `
    #version 300 es
    
    layout(location=0) in vec4 position;
    out vec4 v_position;
    
    void main() {
        v_position = vec4(position.xz, 1.0, 1.0);
        gl_Position = v_position;
    }
`;

// ******************************************************
// **             Application processing               **
// ******************************************************
let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());
let skyboxProgram = app.createProgram(skyboxVertexShader.trim(), skyboxFragmentShader.trim());
let mirrorProgram = app.createProgram(mirrorVertexShader, mirrorFragmentShader);
//
let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let skyboxArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, planePositions))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, planeIndices));

const spherePositionsBuffer = app.createVertexBuffer(PicoGL.FLOAT, 3, spherePositions);
const sphereUvsBuffer = app.createVertexBuffer(PicoGL.FLOAT, 2, sphereUvs);
const sphereIndicesBuffer = app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, sphereIndices);

let mirrorArray = app.createVertexArray()
    .vertexAttributeBuffer(0, spherePositionsBuffer)
    .vertexAttributeBuffer(1, sphereUvsBuffer)
    .indexBuffer(sphereIndicesBuffer);
//
let reflectionResolutionFactor = 0.9;
let reflectionColorTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {magFilter: PicoGL.LINEAR});
let reflectionDepthTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {internalFormat: PicoGL.DEPTH_COMPONENT16});
let reflectionBuffer = app.createFramebuffer().colorTarget(0, reflectionColorTarget).depthTarget(reflectionDepthTarget);
//
let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let modelRotation = quat.create();
let skyboxViewProjectionInverse = mat4.create();
let mirrorModelMatrix = mat4.create();
let mirrorModelViewProjectionMatrix = mat4.create();
let mirrorRotation = quat.create();
//
function calculateSurfaceReflectionMatrix(reflectionMat, mirrorModelMatrix, surfaceNormal) {
    let normal = vec3.transformMat3(vec3.create(), surfaceNormal, mat3.normalFromMat4(mat3.create(), mirrorModelMatrix));
    let pos = mat4.getTranslation(vec3.create(), mirrorModelMatrix);
    let d = -vec3.dot(normal, pos);
    let plane = vec4.fromValues(normal[0], normal[1], normal[2], d);

    reflectionMat[0] = (1 - 2 * plane[0] * plane[0]);
    reflectionMat[4] = ( - 2 * plane[0] * plane[1]);
    reflectionMat[8] = ( - 2 * plane[0] * plane[2]);
    reflectionMat[12] = ( - 2 * plane[3] * plane[0]);

    reflectionMat[1] = ( - 2 * plane[1] * plane[0]);
    reflectionMat[5] = (1 - 2 * plane[1] * plane[1]);
    reflectionMat[9] = ( - 2 * plane[1] * plane[2]);
    reflectionMat[13] = ( - 2 * plane[3] * plane[1]);

    reflectionMat[2] = ( - 2 * plane[2] * plane[0]);
    reflectionMat[6] = ( - 2 * plane[2] * plane[1]);
    reflectionMat[10] = (1 - 2 * plane[2] * plane[2]);
    reflectionMat[14] = ( - 2 * plane[3] * plane[2]);

    reflectionMat[3] = 0;
    reflectionMat[7] = 0;
    reflectionMat[11] = 0;
    reflectionMat[15] = 1;

    return reflectionMat;
}
//
async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

const cubemap = app.createCubemap({
    negX: await loadTexture("sakuraBack.jpg"),
    posX: await loadTexture("sakuraFront.jpg"),
    negY: await loadTexture("sakuraBottom.jpg"),
    posY: await loadTexture("sakuraTop.jpg"),
    negZ: await loadTexture("sakuraLeft.jpg"),
    posZ: await loadTexture("sakuraRight.jpg"),
});

const tex = await loadTexture("kumaColors.png");
let drawCall = app.createDrawCall(program, vertexArray)
    .texture("tex", app.createTexture2D(tex, tex.width, tex.height, {
        magFilter: PicoGL.LINEAR,
        minFilter: PicoGL.LINEAR,
        maxAnisotropy: 1,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE
    }))
    .texture("cubemap", cubemap)
    .uniform("baseColor", baseColor)
    .uniform("ambientLightColor", ambientLightColor);

let skyboxDrawCall = app.createDrawCall(skyboxProgram, skyboxArray)
    .texture("cubemap", cubemap);

let mirrorDrawCall = app.createDrawCall(mirrorProgram, mirrorArray)
    .texture("reflectionTex", reflectionColorTarget)
    .texture("distortionMap", app.createTexture2D(await loadTexture("gold.jpg")));

//
let cameraPosition = vec3.fromValues(0, 0, 100);
const positionsBuffer = new Float32Array(numberOfPointLights * 3);
const colorsBuffer = new Float32Array(numberOfPointLights * 3);

function renderReflectionTexture(time)
{
    app.drawFramebuffer(reflectionBuffer);
    app.viewport(0, 0, reflectionColorTarget.width, reflectionColorTarget.height);
    app.gl.cullFace(app.gl.BACK);

    vec3.rotateY(cameraPosition, vec3.fromValues(0, 20, 120), vec3.fromValues(0, 0, 0), -time * 0.02); // circular rotation
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, -25, 0), vec3.fromValues(0, -1, 0));

    let reflectionMatrix = calculateSurfaceReflectionMatrix(mat4.create(), mirrorModelMatrix, vec3.fromValues(0, 1, 0));
    let reflectionViewMatrix = mat4.mul(mat4.create(), viewMatrix, reflectionMatrix);
    let reflectionCameraPosition = vec3.transformMat4(vec3.create(), cameraPosition, reflectionMatrix);
    drawObjects(reflectionCameraPosition, reflectionViewMatrix);

    app.gl.cullFace(app.gl.BACK);
    app.defaultDrawFramebuffer();
    app.defaultViewport();
}

function drawObjects(cameraPosition, viewMatrix) {
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);

    let skyboxViewProjectionMatrix = mat4.create();
    mat4.mul(skyboxViewProjectionMatrix, projMatrix, viewMatrix);
    mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);

    app.clear();
    
    app.disable(PicoGL.DEPTH_TEST);
    app.disable(PicoGL.CULL_FACE);
    skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
    skyboxDrawCall.draw();

    app.enable(PicoGL.DEPTH_TEST);
    app.enable(PicoGL.CULL_FACE);
    drawCall.uniform("modelMatrix", modelMatrix);
    drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
    drawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), modelMatrix));
    drawCall.uniform("cameraPosition", cameraPosition);
    drawCall.draw(); 
}

function drawMirror() {
    mat4.multiply(mirrorModelViewProjectionMatrix, viewProjMatrix, mirrorModelMatrix);
    mirrorDrawCall.uniform("modelViewProjectionMatrix", mirrorModelViewProjectionMatrix);
    mirrorDrawCall.uniform("screenSize", vec2.fromValues(app.width, app.height))
    mirrorDrawCall.draw();
}

function draw(timems) {
    const time = timems * 0.02;

    // Mirror movement
    quat.fromEuler(mirrorRotation, 0, 10 * Math.cos(time * 0.2), Math.sin(time / 30) / 6);
    mat4.fromRotationTranslationScale(mirrorModelMatrix, mirrorRotation, vec3.fromValues(0, -20, 0), [40.0, 2.0, 40.0]);

    // Light movement
    for (let i = 0; i < numberOfPointLights; i++) {
        vec3.rotateY(pointLightPositions[i], pointLightInitialPositions[i], vec3.fromValues(0, 0, 0), time * 0.05);
        positionsBuffer.set(pointLightPositions[i], i * 3);
        colorsBuffer.set(pointLightColors[i], i * 3);
    }

    drawCall.uniform("lightPositions[0]", positionsBuffer);
    drawCall.uniform("lightColors[0]", colorsBuffer);

    renderReflectionTexture(time);

    mat4.perspective(projMatrix, Math.PI / 7, app.width / app.height, 0.1, 200.0);
    vec3.rotateY(cameraPosition, vec3.fromValues(0, 20, 120), vec3.fromValues(0, 0, 0), time * 0.02); // circular rotation
    vec3.rotateZ(cameraPosition, cameraPosition, vec3.fromValues(0, 0, 0), Math.sin(time / 30) / 6); // up and down movement
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, -0.5, 0), vec3.fromValues(0, 1, 0));

    // Fixing Kuma rotation/center + bouncy animation
    quat.fromEuler(modelRotation, -90, -90, -5 * Math.cos(time * 0.2));
    mat4.fromRotationTranslationScale(modelMatrix, modelRotation, vec3.fromValues(-2.5, -1, 15), [0.85, 1.0, 1.1]);
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

    drawObjects(cameraPosition, viewMatrix);
    drawMirror();

    requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
