import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat3, mat4, vec2, vec3, vec4, quat} from "../node_modules/gl-matrix/esm/index.js";

// ******************************************************
// **                       Data                       **
// ******************************************************

import {positions, normals, uvs, indices} from "../blender/kuma.js"
import {positions as planePositions, indices as planeIndices} from "../blender/plane.js"
import {positions as mirrorPositions, normals as mirrorNormals, uvs as mirrorUvs, indices as mirrorIndices} from "../blender/plane.js"

let postPositions = new Float32Array([
    0.0, 2.0,
    1.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,
]);
let postIndices = new Uint32Array([
    0, 2, 1,
    2, 3, 1
]);

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
        cubemapColor = clamp(cubemapColor, 0.4, 1.0);
        
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

    uniform sampler2D reflectionTex;
    uniform sampler2D distortionMap;
    uniform vec2 screenSize;
    in vec2 v_uv;

    uniform vec4 shadowColor;
    uniform vec3 lightPosition;
    uniform vec3 cameraPosition;    
    uniform sampler2DShadow shadowMap;

    in vec3 vPosition;
    in vec3 vNormal;
    in vec4 vPositionFromLight;
    in vec3 vMirrorPosition;
    out vec4 fragColor;

    void main() {
        vec2 screenPos = gl_FragCoord.xy / screenSize;     
        screenPos.x += (texture(distortionMap, v_uv).r - 0.5) * 0.1;
        vec4 baseColor = texture(reflectionTex, screenPos);

        vec3 shadowCoord = (vPositionFromLight.xyz / vPositionFromLight.w) / 2.0 + 0.5;        
        float shadow = texture(shadowMap, shadowCoord);
        
        vec3 normal = normalize(vNormal);
        vec3 eyeDirection = normalize(cameraPosition - vPosition);
        vec3 lightDirection = normalize(lightPosition - vPosition);        
        vec3 reflectionDirection = reflect(-lightDirection, normal);

        float diffuse = max(dot(lightDirection, normal), 0.0) * max(shadow, 0.3);        
        float specular = shadow * pow(max(dot(reflectionDirection, eyeDirection), 0.0), 100.0) * 1.0;
        fragColor = vec4(diffuse * baseColor.rgb + shadowColor.rgb + specular, baseColor.a);
    }
`;

// language=GLSL
let mirrorVertexShader = `
    #version 300 es
        
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;

    uniform mat4 mirrorMatrix;
    uniform mat4 mirrorViewProjectionMatrix;
    uniform mat4 lightModelViewProjectionMatrix;

    out vec3 vPosition;
    out vec3 vNormal;
    out vec4 vPositionFromLight;
    out vec3 vMirrorPosition;
    
    out vec2 v_uv;

    void main() {
        v_uv = uv;
        vec4 pos = position;
        pos.xz *= 1.5;

        gl_Position = mirrorViewProjectionMatrix * position;
        vMirrorPosition = vec3(position);
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
// **                 Post Processing                  **
// ******************************************************

// language=GLSL
let postFragmentShader = `
    #version 300 es
    precision mediump float;
    
    uniform sampler2D tex;
    uniform sampler2D depthTex;
    uniform float time;
    uniform sampler2D noiseTex;
    
    in vec4 v_position;
    
    out vec4 outColor;

    uniform float coolDown;
    
    vec4 depthOfField(vec4 col, float depth, vec2 uv) {
        vec4 blur = vec4(0.0);
        float n = 0.0;
        for (float u = -1.0; u <= 1.0; u += 0.4)    
            for (float v = -1.0; v <= 1.0; v += 0.4) {
                float factor;
                if (coolDown > 0.0) {
                    factor = abs(depth - 0.995) * 85.0 * sin(coolDown * 0.3);
                }
                else {
                    factor = abs(depth - 0.995) * 5.0;
                }
                blur += texture(tex, uv + vec2(u, v) * factor * 0.02);
                n += 1.0;
            }                
        return blur / n;
    }
    
    void main() {
        vec4 col = texture(tex, v_position.xy);
        float depth = texture(depthTex, v_position.xy).r;

        // Depth of field
        col = depthOfField(col, depth, v_position.xy);
        
        // Contrast + Brightness
        col = pow(col, vec4(1.8)) * 1.3;

        // Fog
        if (coolDown > 0.0) {
            col.rgb = col.rgb + vec3((depth - 0.992) * 10.0 * cos(coolDown * 0.3));    
        }
        else {
            col.rgb = col.rgb + vec3((depth - 0.992) * 10.0);
        }
        
                        
        outColor = col;
    }
`;

// language=GLSL
let postVertexShader = `
    #version 300 es
    
    layout(location=0) in vec4 position;
    out vec4 v_position;
    
    void main() {
        v_position = position;
        gl_Position = position * 2.0 - 1.0;
    }
`;

// ******************************************************
// **             Application Processing               **
// ******************************************************
(async () => {
    let program = app.createProgram(vertexShader, fragmentShader);
    let skyboxProgram = app.createProgram(skyboxVertexShader, skyboxFragmentShader);
    let mirrorProgram = app.createProgram(mirrorVertexShader, mirrorFragmentShader);
    let shadowProgram = app.createProgram(shadowVertexShader, shadowFragmentShader);
    let postProgram = app.createProgram(postVertexShader, postFragmentShader);
    //
    let vertexArray = app.createVertexArray()
        .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
        .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
        .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
        .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

    let skyboxArray = app.createVertexArray()
        .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, planePositions))
        .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, planeIndices));
    //
    const mirrorPositionsBuffer = app.createVertexBuffer(PicoGL.FLOAT, 3, mirrorPositions);
    const mirrorNormalsBuffer = app.createVertexBuffer(PicoGL.FLOAT, 3, mirrorNormals);
    const mirrorUvsBuffer = app.createVertexBuffer(PicoGL.FLOAT, 2, mirrorUvs);
    const mirrorIndicesBuffer = app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, mirrorIndices);

    let mirrorArray = app.createVertexArray()
        .vertexAttributeBuffer(0, mirrorPositionsBuffer)
        .vertexAttributeBuffer(1, mirrorNormalsBuffer)
        .vertexAttributeBuffer(2, mirrorUvsBuffer)
        .indexBuffer(mirrorIndicesBuffer);

    let reflectionResolutionFactor = 0.9;
    let reflectionColorTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {magFilter: PicoGL.LINEAR});
    let reflectionDepthTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {internalFormat: PicoGL.DEPTH_COMPONENT16});
    let reflectionBuffer = app.createFramebuffer().colorTarget(0, reflectionColorTarget).depthTarget(reflectionDepthTarget);

    let shadowDepthTarget = app.createTexture2D(256, 256, {
        internalFormat: PicoGL.DEPTH_COMPONENT16,
        compareMode: PicoGL.COMPARE_REF_TO_TEXTURE,
        magFilter: PicoGL.LINEAR,
        minFilter: PicoGL.LINEAR,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE
    });
    let shadowBuffer = app.createFramebuffer().depthTarget(shadowDepthTarget);

    
    let postArray = app.createVertexArray()
        .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 2, postPositions))
        .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, postIndices));

    let colorTarget = app.createTexture2D(app.width, app.height, {magFilter: PicoGL.LINEAR, wrapS: PicoGL.CLAMP_TO_EDGE, wrapR: PicoGL.CLAMP_TO_EDGE});
    let depthTarget = app.createTexture2D(app.width, app.height, {internalFormat: PicoGL.DEPTH_COMPONENT32F, type: PicoGL.FLOAT});
    let buffer = app.createFramebuffer().colorTarget(0, colorTarget).depthTarget(depthTarget);
    //
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

    let time = 0;
    const countDown = 20;
    let coolDown = countDown;
    let cameraPosition = vec3.fromValues(0, 0, 100);
    let shadowColor = vec4.fromValues(0.9, 0.77, 0.89, 1.0); // very light pink, to match ambientLightColor
    //
    function calculateSurfaceReflectionMatrix(reflectionMat, mirrorMatrix, surfaceNormal) {
        let normal = vec3.transformMat3(vec3.create(), surfaceNormal, mat3.normalFromMat4(mat3.create(), mirrorMatrix));
        let pos = mat4.getTranslation(vec3.create(), mirrorMatrix);
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
        .uniform("shadowColor", vec4.scale(vec4.create(), shadowColor, 0.4))
        .uniform("mirrorMatrix", mirrorMatrix)
        .uniform("mirrorViewProjectionMatrix", mirrorViewProjectionMatrix)
        .uniform("cameraPosition", cameraPosition)
        .uniform("lightPosition", lightPosition)
        .uniform("lightModelViewProjectionMatrix", lightModelViewProjectionMatrix)
        .texture("reflectionTex", reflectionColorTarget)
        .texture("distortionMap", app.createTexture2D(await loadTexture("gold.jpg")))
        .texture("shadowMap", shadowDepthTarget);

    let shadowDrawCall = app.createDrawCall(shadowProgram, vertexArray)
        .uniform("lightModelViewProjectionMatrix", lightModelViewProjectionMatrix);

    let postDrawCall = app.createDrawCall(postProgram, postArray)
        .texture("tex", colorTarget)
        .texture("depthTex", depthTarget)
        .texture("noiseTex", app.createTexture2D(await loadTexture("noise.png")));
    //
    const positionsBuffer = new Float32Array(numberOfPointLights * 3);
    const colorsBuffer = new Float32Array(numberOfPointLights * 3);

    function renderReflectionTexture(time)
    {
        app.drawFramebuffer(reflectionBuffer);
        app.viewport(0, 0, reflectionColorTarget.width, reflectionColorTarget.height);
        app.gl.cullFace(app.gl.BACK);

        vec3.rotateY(cameraPosition, vec3.fromValues(0, 20, 150), vec3.fromValues(0, 0, 0), -time * 0.01); // circular rotation
        vec3.rotateZ(cameraPosition, cameraPosition, vec3.fromValues(0, 0, 0), Math.sin(time / 30) / 6); // up and down movement
        mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, -0.5, 0), vec3.fromValues(0, -1, 0));

        let reflectionMatrix = calculateSurfaceReflectionMatrix(mat4.create(), mirrorMatrix, vec3.fromValues(0, 1, 0));
        let reflectionViewMatrix = mat4.mul(mat4.create(), viewMatrix, reflectionMatrix);
        let reflectionCameraPosition = vec3.transformMat4(vec3.create(), cameraPosition, reflectionMatrix);
        drawObjects(reflectionCameraPosition, reflectionViewMatrix);

        app.gl.cullFace(app.gl.BACK);
        app.defaultDrawFramebuffer();
        app.defaultViewport();
    }

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

        renderReflectionTexture(time);

        // Camera set-up
        mat4.perspective(projMatrix, Math.PI / 7, app.width / app.height, 0.1, 220.0);
        vec3.rotateY(cameraPosition, vec3.fromValues(0, 20, 150), vec3.fromValues(0, 0, 0), time * 0.01); // circular rotation
        vec3.rotateZ(cameraPosition, cameraPosition, vec3.fromValues(0, 0, 0), Math.sin(time / 30) / 6); // up and down movement
        mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, -0.5, 0), vec3.fromValues(0, 1, 0));

        // Mirror movement
        quat.fromEuler(mirrorRotation, 35 * Math.cos(time * 0.01), 0, Math.sin(time / 30) / 6);
        mat4.fromRotationTranslationScale(mirrorMatrix, mirrorRotation, vec3.fromValues(0, -25, 10 * Math.cos(time * 0.05)), [35.0, 2.0, 35.0]);

        // Fixing Kuma rotation/center + bouncy animation
        quat.fromEuler(modelRotation, -90, -90, -5 * Math.cos(time * 0.2));
        mat4.fromRotationTranslationScale(modelMatrix, modelRotation, vec3.fromValues(-2.5, -1, 15), [0.85, 1.0, 1.1]);

        // Shadow light movement
        vec3.set(lightPosition, -50 * Math.sin(time*0.01), 100, 50 * Math.cos(time*0.01)); // also a circular rotation
        mat4.lookAt(lightViewMatrix, lightPosition, vec3.fromValues(-2.5, -1, 15), vec3.fromValues(0, 1, 0));

        // Rendering
        mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);
        renderShadowMap();

        app.drawFramebuffer(buffer);
        app.viewport(0, 0, colorTarget.width, colorTarget.height);

        drawObjects(cameraPosition, viewMatrix);

        mirrorDrawCall.uniform("mirrorViewProjectionMatrix", mirrorViewProjectionMatrix);
        mirrorDrawCall.uniform("screenSize", vec2.fromValues(app.width, app.height))
        mirrorDrawCall.draw();

        app.defaultDrawFramebuffer();
        app.viewport(0, 0, app.width, app.height);

        app.disable(PicoGL.DEPTH_TEST)
           .disable(PicoGL.CULL_FACE);

        postDrawCall.uniform("time", time);
        postDrawCall.uniform("coolDown", coolDown);
        postDrawCall.draw();
        
        if (coolDown > 0.0) {
            coolDown -= 0.1;
        }
        else {
            if (Math.floor(time) % 200.0 == 0.0) coolDown = countDown;
        }
        
        //console.log(time);

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();
