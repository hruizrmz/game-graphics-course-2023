import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat3, mat4, vec2, vec3, vec4, quat} from "../node_modules/gl-matrix/esm/index.js";

// ******************************************************
// **                       Data                       **
// ******************************************************

import {positions, normals, uvs, indices} from "../blender/kuma.js"
import {positions as planePositions, indices as planeIndices} from "../blender/plane.js"
import {positions as mirrorPositions, normals as mirrorNormals, indices as mirrorIndices} from "../blender/plane.js"

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
// **             Mirror Plane Processing              **
// ******************************************************

// language=GLSL
let mirrorFragmentShader = `
    #version 300 es    
    precision highp float;    
    precision highp sampler2DShadow;

    uniform vec4 baseColor;
    uniform vec4 ambientColor;
    uniform vec3 lightPosition;
    uniform vec3 cameraPosition;    
    uniform sampler2DShadow shadowMap;

    in vec3 vPosition;
    in vec3 vNormal;
    in vec4 vPositionFromLight;
    in vec3 vmirrorPosition;
    out vec4 fragColor;

    void main() {
        vec3 shadowCoord = (vPositionFromLight.xyz / vPositionFromLight.w) / 2.0 + 0.5;        
        float shadow = texture(shadowMap, shadowCoord);
        
        vec3 normal = normalize(vNormal);
        vec3 eyeDirection = normalize(cameraPosition - vPosition);
        vec3 lightDirection = normalize(lightPosition - vPosition);        
        vec3 reflectionDirection = reflect(-lightDirection, normal);
        
        float diffuse = max(dot(lightDirection, normal), 0.0) * max(shadow, 0.2);        
        float specular = shadow * pow(max(dot(reflectionDirection, eyeDirection), 0.0), 100.0) * 0.7;
        fragColor = vec4(diffuse * baseColor.rgb + ambientColor.rgb + specular, baseColor.a);
    }
`;

// language=GLSL
let mirrorVertexShader = `
    #version 300 es
        
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;

    uniform mat4 mirrorMatrix;
    uniform mat4 mirrorViewProjectionMatrix;
    uniform mat4 lightModelViewProjectionMatrix;

    out vec3 vPosition;
    out vec3 vNormal;
    out vec4 vPositionFromLight;
    out vec3 vmirrorPosition;

    void main() {
        gl_Position = mirrorViewProjectionMatrix * position;
        vmirrorPosition = vec3(position);
        vPosition = vec3(mirrorMatrix * position);
        vNormal = vec3(mirrorMatrix * vec4(normal, 0.0));
        vPositionFromLight = lightModelViewProjectionMatrix * position;
    }
`;

// ******************************************************
// **                Shadow Processing                 **
// ******************************************************

// language=GLSL
let shadowFragmentShader = `
    #version 300 es
    precision highp float;
    
    out vec4 fragColor;
    
    void main() {
    }
`;

// language=GLSL
let shadowVertexShader = `
    #version 300 es
    layout(location=0) in vec4 position;
    uniform mat4 lightModelViewProjectionMatrix;
    
    void main() {
        gl_Position = lightModelViewProjectionMatrix * position;
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
let fgColor = vec4.fromValues(1.0, 1.0, 1.0, 1.0); // white, same as baseColor
let bgColor = vec4.fromValues(0.98, 0.27, 0.85, 1.0); // pink, same as ambientLightColor

app.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);

let program = app.createProgram(vertexShader, fragmentShader);
let skyboxProgram = app.createProgram(skyboxVertexShader, skyboxFragmentShader);
let mirrorProgram = app.createProgram(mirrorVertexShader, mirrorFragmentShader);
let shadowProgram = app.createProgram(shadowVertexShader, shadowFragmentShader);
//
let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let skyboxArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, planePositions))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, planeIndices));

let mirrorVertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, mirrorPositions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, mirrorNormals))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, mirrorIndices));

let shadowDepthTarget = app.createTexture2D(256, 256, {
    internalFormat: PicoGL.DEPTH_COMPONENT16,
    compareMode: PicoGL.COMPARE_REF_TO_TEXTURE,
    magFilter: PicoGL.LINEAR,
    minFilter: PicoGL.LINEAR,
    wrapS: PicoGL.CLAMP_TO_EDGE,
    wrapT: PicoGL.CLAMP_TO_EDGE
});
let shadowBuffer = app.createFramebuffer().depthTarget(shadowDepthTarget);
//
let time = 0;
let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let modelRotation = quat.create();
let skyboxViewProjectionInverse = mat4.create();
let mirrorMatrix = mat4.create();
let mirrorViewMatrix = mat4.create();
let mirrorViewProjectionMatrix = mat4.create();
let mirrorRotation = quat.create();
let lightModelViewProjectionMatrix = mat4.create();
let lightPosition = vec3.create();
let lightViewMatrix = mat4.create();
let lightViewProjMatrix = mat4.create();
let cameraPosition = vec3.fromValues(0, 0, 100);
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

let mirrorDrawCall = app.createDrawCall(mirrorProgram, mirrorVertexArray)
    .uniform("baseColor", fgColor)
    .uniform("ambientColor", vec4.scale(vec4.create(), bgColor, 0.4))
    .uniform("mirrorMatrix", mirrorMatrix)
    .uniform("mirrorViewProjectionMatrix", mirrorViewProjectionMatrix)
    .uniform("cameraPosition", cameraPosition)
    .uniform("lightPosition", lightPosition)
    .uniform("lightModelViewProjectionMatrix", lightModelViewProjectionMatrix)
    .texture("shadowMap", shadowDepthTarget);

let shadowDrawCall = app.createDrawCall(shadowProgram, vertexArray)
    .uniform("lightModelViewProjectionMatrix", lightModelViewProjectionMatrix);
//

const positionsBuffer = new Float32Array(numberOfPointLights * 3);
const colorsBuffer = new Float32Array(numberOfPointLights * 3);

function renderShadowMap() {
    app.drawFramebuffer(shadowBuffer);
    app.viewport(0, 0, shadowDepthTarget.width, shadowDepthTarget.height);
    app.gl.cullFace(app.gl.FRONT);

    // Projection and view matrices are changed to render objects from the point view of light source
    mat4.perspective(projMatrix, Math.PI / 7, shadowDepthTarget.width / shadowDepthTarget.height, 0.1, 200.0);
    mat4.multiply(lightViewProjMatrix, projMatrix, lightViewMatrix);

    // Renders mirror, then Kuma
    app.clear();
    app.enable(PicoGL.DEPTH_TEST);
    app.enable(PicoGL.CULL_FACE);

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);
    mat4.multiply(lightModelViewProjectionMatrix, lightViewProjMatrix, modelMatrix);
    shadowDrawCall.draw(); 
    /////////

    app.gl.cullFace(app.gl.BACK);
    app.defaultDrawFramebuffer();
    app.defaultViewport();
}

function drawObjects(cameraPosition, viewMatrix) {
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);
    mat4.multiply(lightModelViewProjectionMatrix, lightViewProjMatrix, modelMatrix);

    mat4.multiply(mirrorViewMatrix, viewMatrix, mirrorMatrix);
    mat4.multiply(mirrorViewProjectionMatrix, viewProjMatrix, mirrorMatrix);
    mat4.multiply(lightModelViewProjectionMatrix, lightViewProjMatrix, mirrorMatrix);

    let skyboxViewProjectionMatrix = mat4.create();
    mat4.mul(skyboxViewProjectionMatrix, projMatrix, viewMatrix);
    mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);

    app.clear();
    
    app.disable(PicoGL.DEPTH_TEST);
    app.disable(PicoGL.CULL_FACE);
    skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
    skyboxDrawCall.draw();

    mirrorDrawCall.draw();

    app.enable(PicoGL.DEPTH_TEST);
    app.enable(PicoGL.CULL_FACE);
    drawCall.uniform("modelMatrix", modelMatrix);
    drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
    drawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), modelMatrix));
    drawCall.uniform("cameraPosition", cameraPosition);
    drawCall.draw(); 
}

function draw(timems) {
    time = timems * 0.02;

    // Ambient light movement
    for (let i = 0; i < numberOfPointLights; i++) {
        vec3.rotateY(pointLightPositions[i], pointLightInitialPositions[i], vec3.fromValues(0, 0, 0), time * 0.05);
        positionsBuffer.set(pointLightPositions[i], i * 3);
        colorsBuffer.set(pointLightColors[i], i * 3);
    }

    drawCall.uniform("lightPositions[0]", positionsBuffer);
    drawCall.uniform("lightColors[0]", colorsBuffer);

    // Camera set-up
    mat4.perspective(projMatrix, Math.PI / 7, app.width / app.height, 0.1, 220.0);
    vec3.rotateY(cameraPosition, vec3.fromValues(0, 20, 150), vec3.fromValues(0, 0, 0), time * 0.01); // circular rotation
    vec3.rotateZ(cameraPosition, cameraPosition, vec3.fromValues(0, 0, 0), Math.sin(time / 30) / 6); // up and down movement
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, -0.5, 0), vec3.fromValues(0, 1, 0));

    // mirror movement
    quat.fromEuler(mirrorRotation, 0, 10, Math.sin(time / 30) / 6);
    mat4.fromRotationTranslationScale(mirrorMatrix, mirrorRotation, vec3.fromValues(0, -25, 10), [45.0, 2.0, 45.0]);

    // Fixing Kuma rotation/center + bouncy animation
    quat.fromEuler(modelRotation, -90, -90, -5 * Math.cos(time * 0.2));
    mat4.fromRotationTranslationScale(modelMatrix, modelRotation, vec3.fromValues(-2.5, -1, 15), [0.85, 1.0, 1.1]);

    // Shadow light movement
    vec3.set(lightPosition, -50 * Math.sin(time*0.01), 100, 50 * Math.cos(time*0.01)); // also a circular rotation
    mat4.lookAt(lightViewMatrix, lightPosition, vec3.fromValues(-2.5, -1, 15), vec3.fromValues(0, 1, 0));

    // Rendering
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);
    renderShadowMap();
    drawObjects(cameraPosition, viewMatrix);
    requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
