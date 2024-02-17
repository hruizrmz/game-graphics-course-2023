import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, vec4, quat} from "../node_modules/gl-matrix/esm/index.js";

// ******************************************************
// **                       Data                       **
// ******************************************************

import {positions, normals, uvs, indices} from "../blender/kuma.js"
import {positions as planePositions, uvs as planeUvs, indices as planeIndices} from "../blender/plane.js"

// ******************************************************
// **               Light configuration                **
// ******************************************************

let baseColor = vec3.fromValues(1.0, 1.0, 1.0); // white base
let ambientLightColor = vec3.fromValues(0.98, 0.27, 0.85); // pink ambience
let numberOfPointLights = 1;
let pointLightColors = [vec3.fromValues(1.0, 1.0, 1.0)];
let pointLightInitialPositions = [vec3.fromValues(10, -5, 10)];
let pointLightPositions = [vec3.create()];


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
    in vec4 vColor;
    
    uniform sampler2D tex;
    in vec2 v_uv;
    
    out vec4 outColor;
    
    void main()
    {   
        // Phong shading (per-fragment)
        vec2 invertedUV = vec2(v_uv.x, 1.0 - v_uv.y); // texture was being loaded backwards
        outColor = calculateLights(normalize(vNormal), vPosition) * texture(tex, invertedUV);
    }
`;

// language=GLSL
let vertexShader = `
    #version 300 es
            
    // uniform float time;
    uniform mat4 modelMatrix;
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec4 normal;
    layout(location=2) in vec2 uv;

    out vec3 vPosition;    
    out vec3 vNormal;
    out vec4 vColor;
        
    out vec2 v_uv;
    
    void main()
    {
        vec4 worldPosition = modelMatrix * position;
        gl_Position = modelViewProjectionMatrix * worldPosition;

        vPosition = worldPosition.xyz;        
        vNormal = (modelMatrix * normal).xyz;

        v_uv = uv;
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

app.enable(PicoGL.DEPTH_TEST)
   .enable(PicoGL.CULL_FACE);

let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());
let skyboxProgram = app.createProgram(skyboxVertexShader.trim(), skyboxFragmentShader.trim());

let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let skyboxArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, planePositions))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, planeIndices));

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let modelRotation = quat.create();
let skyboxViewProjectionInverse = mat4.create();

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
    }))
    .uniform("baseColor", baseColor)
    .uniform("ambientLightColor", ambientLightColor);

let skyboxDrawCall = app.createDrawCall(skyboxProgram, skyboxArray)
    .texture("cubemap", app.createCubemap({
        negX: await loadTexture("sakuraBack.jpg"),
        posX: await loadTexture("sakuraFront.jpg"),
        negY: await loadTexture("sakuraBottom.jpg"),
        posY: await loadTexture("sakuraTop.jpg"),
        negZ: await loadTexture("sakuraLeft.jpg"),
        posZ: await loadTexture("sakuraRight.jpg"),
        wrapT: PicoGL.MIRRORED_REPEAT
    }));

let cameraPosition = vec3.fromValues(0, 0, 100);
const positionsBuffer = new Float32Array(numberOfPointLights * 3);
const colorsBuffer = new Float32Array(numberOfPointLights * 3);

function draw(timems) {
    const time = timems * 0.02;

    mat4.perspective(projMatrix, Math.PI / 7, app.width / app.height, 0.1, 100.0);
    vec3.rotateY(cameraPosition, vec3.fromValues(0, 0, 80), vec3.fromValues(0, 0, 0), time * 0.008); // circular rotation
    vec3.rotateZ(cameraPosition, cameraPosition, vec3.fromValues(0, 0, 0), Math.sin(time / 30) / 6); // up and down movement
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
    mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

    // Fixing Kuma rotation/center + bouncy animation
    quat.fromEuler(modelRotation, 90, 5 * -Math.cos(time * 0.2), 90);
    mat4.fromRotationTranslationScale(modelMatrix, modelRotation, vec3.fromValues(-2.5, -1, 0), [0.9, 0.9, 0.9]);
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);

    let skyboxViewProjectionMatrix = mat4.create();
    mat4.mul(skyboxViewProjectionMatrix, projMatrix, viewMatrix);
    mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);

    app.clear();
    drawCall.uniform("time", time);
    
    app.disable(PicoGL.DEPTH_TEST);
    app.disable(PicoGL.CULL_FACE);
    skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
    skyboxDrawCall.draw();

    app.enable(PicoGL.DEPTH_TEST);
    app.enable(PicoGL.CULL_FACE);
    drawCall.uniform("modelMatrix", modelMatrix);
    drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);

    for (let i = 0; i < numberOfPointLights; i++) {
        vec3.rotateY(pointLightPositions[i], pointLightInitialPositions[i], vec3.fromValues(0, 0, 0), time * 0.05);
        positionsBuffer.set(pointLightPositions[i], i * 3);
        colorsBuffer.set(pointLightColors[i], i * 3);
    }

    drawCall.uniform("lightPositions[0]", positionsBuffer);
    drawCall.uniform("lightColors[0]", colorsBuffer);

    drawCall.draw();

    requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
