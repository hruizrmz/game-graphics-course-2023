import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, indices, uvs} from "../blender/monkey.js"

// ******************************************************
// **               Light configuration                **
// ******************************************************

let baseColor1 = vec3.fromValues(0.6, 0.8, 1.0); // light blue
let baseColor2 = vec3.fromValues(0.8, 0.8, 0.3); // gold
let ambientLightColor = vec3.fromValues(0.5, 0.5, 0.5);
let numberOfPointLights = 3;
let pointLightColors = [vec3.fromValues(1.0, 0.2, 0.8), vec3.fromValues(0.1, 1.0, 0.3), vec3.fromValues(1.0, 1.0, 1.0)]; // pink, green, white
let pointLightInitialPositions = [vec3.fromValues(0, 5, 2), vec3.fromValues(0, -5, 2), vec3.fromValues(0, 10, -20)];
let pointLightPositions = [vec3.create(), vec3.create(), vec3.create()];


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
        float diffuseIntensity = 0.8;
        float specularIntensity = 5.0;
        float specularPower = 100.0;
        float metalness = 0.7;

        vec3 viewDirection = normalize(cameraPosition.xyz - position);
        vec3 color = baseColor * ambientLightColor * ambientIntensity;
                
        for (int i = 0; i < lightPositions.length(); i++) {
            vec3 lightDirection = normalize(lightPositions[i] - position);
            
            // Lambertian reflection (ideal diffuse of matte surfaces) is also a part of Phong model                        
            float diffuse = max(dot(lightDirection, normal), 0.0);                                    
            color += baseColor * lightColors[i] * diffuse * diffuseIntensity;
                      
            // Phong specular highlight 
            float specular = pow(max(dot(viewDirection, reflect(-lightDirection, normal)), 0.0), specularPower);
            
            // Blinn-Phong improved specular highlight
            // float specular = pow(max(dot(normalize(lightDirection + viewDirection), normal), 0.0), specularPower);
            color += mix(vec3(1.0), baseColor, metalness) * lightColors[i] * specular * specularIntensity;
        }
        return vec4(color, 1.0);
    }
`;

// language=GLSL
let fragmentShader = `
    #version 300 es
    precision highp float;        
    ${lightCalculationShader}        
    
    in vec3 vPosition;    
    in vec3 vNormal;
    in vec4 vColor;    
    
    out vec4 outColor;        
    
    uniform sampler2D tex;    
    in vec2 v_uv;
    
    void main() {                      
        // For Phong shading (per-fragment) move color calculation from vertex to fragment shader
        outColor = calculateLights(normalize(vNormal), vPosition) * texture(tex, v_uv);
        // outColor = vColor;
    }
`;

// language=GLSL
let vertexShader = `
    #version 300 es
    ${lightCalculationShader}
        
    layout(location=0) in vec4 position;
    layout(location=1) in vec4 normal;
    layout(location=2) in vec2 uv;
    
    uniform mat4 viewProjectionMatrix;
    uniform mat4 modelMatrix;            
    
    out vec3 vPosition;    
    out vec3 vNormal;
    out vec4 vColor;

    out vec2 v_uv;
    
    void main() {
        vec4 worldPosition = modelMatrix * position;
        
        vPosition = worldPosition.xyz;        
        vNormal = (modelMatrix * normal).xyz;
        
        // For Gouraud shading (per-vertex) move color calculation from fragment to vertex shader
        //vColor = calculateLights(normalize(vNormal), vPosition);
        
        gl_Position = viewProjectionMatrix * worldPosition;               
        v_uv = uv;         
    }
`;


app.enable(PicoGL.DEPTH_TEST)
   .enable(PicoGL.CULL_FACE);

let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());

let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let projectionMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjectionMatrix = mat4.create();
let modelMatrix = mat4.create();

async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

const tex1 = await loadTexture("diamond.jpg");
let drawCall1 = app.createDrawCall(program, vertexArray)
    .texture("tex", app.createTexture2D(tex1, tex1.width, tex1.height, {
        magFilter: PicoGL.LINEAR,
        minFilter: PicoGL.LINEAR,
        maxAnisotropy: 1,
        wrapS: PicoGL.REPEAT,
        wrapT: PicoGL.REPEAT,
    }))
    .uniform("baseColor", baseColor1)
    .uniform("ambientLightColor", ambientLightColor);

const tex2 = await loadTexture("gold.jpg");
let drawCall2 = app.createDrawCall(program, vertexArray)
    .texture("tex", app.createTexture2D(tex2, tex2.width, tex2.height, {
        magFilter: PicoGL.LINEAR,
        minFilter: PicoGL.LINEAR,
        maxAnisotropy: 1,
        wrapS: PicoGL.REPEAT,
        wrapT: PicoGL.REPEAT,
    }))
    .uniform("baseColor", baseColor2)
    .uniform("ambientLightColor", ambientLightColor);

let cameraPosition = vec3.fromValues(0, -4, 1);

const positionsBuffer = new Float32Array(numberOfPointLights * 3);
const colorsBuffer = new Float32Array(numberOfPointLights * 3);

function draw(timestamp) {
    const time = timestamp * 0.001;

    mat4.perspective(projectionMatrix, Math.PI / 4, app.width / app.height, 0.1, 100.0);
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
    mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix);
    mat4.fromTranslation(modelMatrix, vec3.fromValues(2, 0, 0));

    drawCall1.uniform("viewProjectionMatrix", viewProjectionMatrix);
    drawCall1.uniform("modelMatrix", modelMatrix);
    drawCall1.uniform("cameraPosition", cameraPosition);

    for (let i = 0; i < numberOfPointLights; i++) {
        vec3.rotateZ(pointLightPositions[i], pointLightInitialPositions[i], vec3.fromValues(0, 0, 0), time);
        positionsBuffer.set(pointLightPositions[i], i * 3);
        colorsBuffer.set(pointLightColors[i], i * 3);
    }

    drawCall1.uniform("lightPositions[0]", positionsBuffer);
    drawCall1.uniform("lightColors[0]", colorsBuffer);

    app.clear();
    drawCall1.draw();

    mat4.perspective(projectionMatrix, Math.PI / 4, app.width / app.height, 0.1, 100.0);
    mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
    mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix);
    mat4.fromTranslation(modelMatrix, vec3.fromValues(-2, 0, 0));

    drawCall2.uniform("viewProjectionMatrix", viewProjectionMatrix);
    drawCall2.uniform("modelMatrix", modelMatrix);
    drawCall2.uniform("cameraPosition", cameraPosition);

    drawCall2.draw();

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
