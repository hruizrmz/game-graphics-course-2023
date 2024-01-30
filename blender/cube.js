//         -.5 .5 -.5  +--------------+ .5 .5 -.5
//                    /|             /|
//                   / |            / |
//      -.5 .5 .5   *--+-----------*  | .5 .5 .5
//                  |  |           |  |
//                  |  |           |  |
//                  |  |           |  |
//     -.5 -.5 -.5  |  +-----------+--+ .5 -.5 -.5
//                  | /            | /
//                  |/             |/
//     -.5 -.5 .5   *--------------*  .5 -.5 .5


export const positions = new Float32Array([
    // front
    -0.5, 0.5, 0.5,
    0.5, 0.5, 0.5,
    0.5, -0.5, 0.5,
    -0.5, -0.5, 0.5,

    // back
    -0.5, 0.5, -0.5,
    0.5, 0.5, -0.5,
    0.5, -0.5, -0.5,
    -0.5, -0.5, -0.5,

    //top
    -0.5, 0.5, 0.5,
    0.5, 0.5, 0.5,
    0.5, 0.5, -0.5,
    -0.5, 0.5, -0.5,

    //bottom
    -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5,
    0.5, -0.5, -0.5,
    -0.5, -0.5, -0.5,

    //left
    -0.5, -0.5, 0.5,
    -0.5, 0.5, 0.5,
    -0.5, 0.5, -0.5,
    -0.5, -0.5, -0.5,

    //right
    0.5, -0.5, 0.5,
    0.5, 0.5, 0.5,
    0.5, 0.5, -0.5,
    0.5, -0.5, -0.5,
]);

export const normals = new Float32Array([
    // front
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,

    // back
    0.0, 0.0, -1.0,
    0.0, 0.0, -1.0,
    0.0, 0.0, -1.0,
    0.0, 0.0, -1.0,

    //top
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,

    //bottom
    0.0, -1.0, 0.0,
    0.0, -1.0, 0.0,
    0.0, -1.0, 0.0,
    0.0, -1.0, 0.0,

    //left
    -1.0, 0.0, 0.0,
    -1.0, 0.0, 0.0,
    -1.0, 0.0, 0.0,
    -1.0, 0.0, 0.0,

    //right
    1.0, 0.0, 0.0,
    1.0, 0.0, 0.0,
    1.0, 0.0, 0.0,
    1.0, 0.0, 0.0,
]);

export const uvs = new Float32Array([
    // top
    0.0, 0.0,
    0.33, 0.0,
    0.33, 0.5,
    0.0, 0.5,

    // bottom
    0.0, 0.5,
    0.33, 0.5,
    0.33, 1.0,
    0.0, 1.0,

    //back
    0.34, 0.0,
    0.66, 0.0,
    0.66, 0.5,
    0.34, 0.5,

    //front
    0.34, 0.5,
    0.66, 0.5,
    0.66, 1.0,
    0.34, 1.0,

    //left
    0.67, 0.0,
    1.0, 0.0,
    1.0, 0.5,
    0.67, 0.5,

    //right
    0.67, 0.5,
    1.0, 0.5,
    1.0, 1.0,
    0.67, 1.0,
]);

export const indices = new Uint32Array([
    // front
    2, 1, 0,
    0, 3, 2,

    // back
    4, 5, 6,
    6, 7, 4,

    // top
    8, 9, 10,
    10, 11, 8,

    // bottom
    14, 13, 12,
    12, 15, 14,

    // left
    16, 17, 18,
    18, 19, 16,

    // right
    22, 21, 20,
    20, 23, 22,
]);
