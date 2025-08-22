import { FaceLandmarker, FilesetResolver, DrawingUtils } from  '@mediapipe/tasks-vision'
import cv from '../opencv'
import path from "path";

export default class AnceHeadPost {

    options= {
        baseOptions: {
            modelAssetPath: `/models/face_landmarker.task`,
            delegate: 'GPU',
        },
        numFaces: 1,
        runningMode: 'IMAGE',
    }
    faceLandmarker = null

    constructor() {
        this.createFaceLandmarker().then(() => {
            this.opencvIsReady().then(() => {
                console.log('opencv.js 加载成功')
            })
        })
    }

    opencvIsReady() {
        return new Promise(resolve => {
            global.Module = {
                onRuntimeInitialized: resolve
            };
            global.cv = require('../opencv.js')
        })
    }

    async createFaceLandmarker() {
        try {
            console.log('createFaceLandmarker start')
            const wasmPath = window.location.origin + '/mediapipe/wasm';
            // const wasmPath = path.join(process.cwd(), 'public', 'wasm')
            console.log(`---------------${wasmPath}`)
            const filesetResolver = await FilesetResolver.forVisionTasks(
                wasmPath
            );
            const faceLandmarker = await FaceLandmarker.createFromOptions(
                filesetResolver,
                this.options
            );
            this.faceLandmarker = faceLandmarker
            console.log('createFaceLandmarker done', faceLandmarker)
        } catch (e) {
            console.error("FaceLandmarker 初始化失败:", e);
        }
    }

    headIrisDetection(image) {
        const detection = this.faceLandmarker.detect(image);
        console.log('检测结果:', detection);
        // LEFT  CENTER RIGHT  NONE
        let eyePosition = "NONE"
        if (detection && detection.faceLandmarks && detection.faceLandmarks.length > 0) {
            let angle = this.processHeadPose(image, detection.faceLandmarks)
            let pitch = parseFloat(angle[0])
            let yaw = parseFloat(angle[1])
            let roll = parseFloat(angle[2])
            console.log(`头部姿态 pitch: ${pitch}, yaw: ${yaw}, roll: ${roll}`)
            if ((yaw >= -30 && yaw <= 30) && (roll >= -30 && roll <= 30)) {
                eyePosition = this.calcEyesPosition(image, detection.faceLandmarks[0])
            }
        }
        return eyePosition
    }

    //--------------------------头部姿态--------------------------------

    // 将旋转角度转为度数
    rotationMatrixToAngles(rotationMatrix) {
        const x = Math.atan2(rotationMatrix[7], rotationMatrix[8]);
        const y = Math.atan2(
            -rotationMatrix[6],
            Math.sqrt(Math.pow(rotationMatrix[0], 2) + Math.pow(rotationMatrix[3], 2))
        );
        const z = Math.atan2(rotationMatrix[3], rotationMatrix[0]);
        return [x, y, z].map(angle => angle * 180 / Math.PI);
    }

    processHeadPose(inputImage, faceLandmarks) {
        console.log(`inputImage.width: ${inputImage.width}, height: ${inputImage.height}`)
        const canvas = document.getElementById('headPose')
        canvas.width = inputImage.width
        canvas.height = inputImage.height

        // 转换 RGB 回 BGR
        let originImg = cv.imread(inputImage);
        let bgrImg = new cv.Mat();
        cv.cvtColor(originImg, bgrImg, cv.COLOR_RGB2BGR);

        const faceCoordinationInRealWorld = [
            [285, 528, 200],
            [285, 371, 152],
            [197, 574, 128],
            [173, 425, 108],
            [360, 574, 128],
            [391, 425, 108]
        ];
        const faceCoordinationInImage = [];

        if (faceLandmarks) {
            const landmarks = faceLandmarks[0];
            landmarks.forEach((lm, idx) => {
                if ([1, 9, 57, 130, 287, 359].includes(idx)) {
                    const x = Math.round(lm.x * canvas.width);
                    const y = Math.round(lm.y * canvas.height);
                    faceCoordinationInImage.push([x, y]);
                }
            });

            // 转为浮点矩阵
            const faceCoordImageMat = cv.matFromArray(
                faceCoordinationInImage.length,
                2,
                cv.CV_64FC1,
                faceCoordinationInImage.flat()
            );
            const faceCoordRealMat = cv.matFromArray(
                faceCoordinationInRealWorld.length,
                3,
                cv.CV_64FC1,
                faceCoordinationInRealWorld.flat()
            );

            const focalLength = canvas.width;
            // 相机的内参矩阵
            const camMatrix = cv.matFromArray(3, 3, cv.CV_64FC1, [
                focalLength, 0, canvas.width / 2,
                0, focalLength, canvas.height / 2,
                0, 0, 1
            ]);
            // 畸变系数矩阵
            const distMatrix = new cv.Mat.zeros(4, 1, cv.CV_64FC1);

            // solvePnP
            const rvec = new cv.Mat(); // 旋转向量
            const tvec = new cv.Mat(); // 平移向量
            let result = cv.solvePnP(
                faceCoordRealMat,
                faceCoordImageMat,
                camMatrix,
                distMatrix,
                rvec,
                tvec
            );
            console.log(`空间转换是否成功：`, result)
            if (result) {
                console.log(`旋转矩阵`, rvec)
                console.log(`平移矩阵`, tvec)
            }
            // Rodrigues 转换成欧拉角
            const rotationMatrix = new cv.Mat();
            cv.Rodrigues(rvec, rotationMatrix);

            const angles = this.rotationMatrixToAngles(rotationMatrix.data64F);

            // pitch: 抬头或低头   yaw: 左右转动   roll: 头部倾斜
            ['pitch', 'yaw', 'roll'].forEach((name, i) => {
                const text = `${name}: ${Math.round(angles[i])}`;
                cv.putText(
                    bgrImg,
                    text,
                    {x: 20, y: i * 30 + 20},
                    cv.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    [200, 0, 200, 255],
                    2
                );
            });
            this.showResultToCanvas(bgrImg, 'headPose')
            rvec.delete();
            tvec.delete();
            rotationMatrix.delete();

            return angles
        }
    }

    //--------------------------眼球跟踪--------------------------------
    calcEyesPosition(image, landMarks) {
        console.log(`image width: ${image.width}, height: ${image.height}`)
        const leftCoords = this.eyeCoordsExtractor(landMarks, 'left', image.width, image.height)
        const rightCoords = this.eyeCoordsExtractor(landMarks, 'right', image.width, image.height)

        const [right_eye, left_eye] = this.eyesExtractor(image, rightCoords[0], leftCoords[0], rightCoords[1], leftCoords[1])

        // Estimate eye position (gaze direction)
        const eye_position_right = this.positionEstimator(right_eye, 'right');
        const eye_position_left = this.positionEstimator(left_eye, 'left');
        console.log(`右眼方向: ${eye_position_right}, 左眼方向：${eye_position_left}`)
        return {right: eye_position_right, left: eye_position_left}
    }

    eyeCoordsExtractor(landMarks, side, width, height) {
        if (!landMarks) {
            return
        }
        let eyeConnect;
        let eyeIndex = []
        let eyeCoords = []
        let irisConnect;
        if (side === 'left') {
            eyeConnect = FaceLandmarker.FACE_LANDMARKS_LEFT_EYE
            irisConnect = FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS
        } else {
            eyeConnect = FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE
            irisConnect = FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS
        }
        console.log(side + 'eyeIris', irisConnect)
        // 获取眼睛坐标
        let middleIndex = eyeConnect.length % 2 === 0 ? eyeConnect.length / 2 : (eyeConnect.length / 2 + 1)

        for (let index = 0; index < middleIndex; index++) {
            if (eyeIndex.indexOf(eyeConnect[index].start) === -1) {
                eyeIndex.push(eyeConnect[index].start)
            }
            if (eyeIndex.indexOf(eyeConnect[index].end) === -1) {
                eyeIndex.push(eyeConnect[index].end)
            }
        }

        for (let index = eyeConnect.length - 1; index > middleIndex; index--) {
            if (eyeIndex.indexOf(eyeConnect[index].start) === -1) {
                eyeIndex.push(eyeConnect[index].start)
            }
            if (eyeIndex.indexOf(eyeConnect[index].end) === -1) {
                eyeIndex.push(eyeConnect[index].end)
            }
        }
        eyeIndex.push(eyeConnect[middleIndex].start)

        console.log(`${side} eye index: `, eyeIndex)
        eyeCoords = eyeIndex.map(index => {
            return {'x': landMarks[index].x * width, 'y': landMarks[index].y * height}
        })
        console.log(`${side} eye coords: `, eyeCoords)

        // 取出眼睛坐标中y的最小值和最大值
        let y_min = eyeCoords.reduce((min, point) => point.y < min ? point.y : min, eyeCoords[0].y)
        let y_max = eyeCoords.reduce((max, point) => point.y > max ? point.y : max, eyeCoords[0].y)

        // 获取虹膜的左边
        let irisIndex = []
        irisConnect.forEach(connect => {
            if (!irisIndex.includes(connect.start)) {
                irisIndex.push(connect.start)
            }
        })
        console.log(`${side} iris index: `, irisIndex)
        let irisCords = irisIndex.map(index => {
            let y = landMarks[index].y * height
            if (y > y_max) {
                y = y_max
            }
            if (y < y_min) {
                y = y_min
            }
            return {'x': landMarks[index].x * width, 'y': y}
        })
        console.log(`${side} iris coords: `, irisCords)

        return [eyeCoords, irisCords]
    }

    // 转换为 OpenCV 的点集格式
    convertToCvPoints(coords) {
        return coords.map(coord => new cv.Point(coord.x, coord.y));
    }

    // 通过坐标获取多边形数组
    getPolyMatFromCoords(eye_coords) {
        let points = this.convertToCvPoints(eye_coords)
        // 多边形
        let eye_mat = cv.matFromArray(points.length, 1, cv.CV_32SC2, points.flatMap(p => [p.x, p.y]));
        return eye_mat
    }

    // Eyes Extractor function
    eyesExtractor(img, right_eye_coords, left_eye_coords, right_iris_coords, left_iris_coords) {
        let matImg = cv.imread(img);
        let gray = new cv.Mat();
        cv.cvtColor(matImg, gray, cv.COLOR_BGR2GRAY);
        // this.showResultToCanvas(gray, 'gray')

        let dim = gray.size();

        let mask = new cv.Mat.zeros(dim.height, dim.width, cv.CV_8UC1);
        // this.showResultToCanvas(mask, 'mask')

        // 多边形
        let right_eye_mat = this.getPolyMatFromCoords(right_eye_coords)
        let left_eye_mat = this.getPolyMatFromCoords(left_eye_coords)

        //Step 6: Wrap the eye points in a cv.MatVector
        let matVector = new cv.MatVector();
        matVector.push_back(right_eye_mat);
        matVector.push_back(left_eye_mat);
        // Step 7: Fill the mask with white (255) for the eye regions
        cv.fillPoly(mask, matVector, new cv.Scalar(255, 255, 255));
        // this.showResultToCanvas(mask, 'mask')

        // Step 8: Apply the mask to the grayscale image to extract the eye regions
        let eyes = new cv.Mat();
        cv.bitwise_and(gray, gray, eyes, mask);
        this.showResultToCanvas(eyes, 'eyeRegion')

        // 虹膜处理
        let right_iris_mat = this.getPolyMatFromCoords(right_iris_coords);
        let left_iris_mat = this.getPolyMatFromCoords(left_iris_coords);

        let iris_mat_vector = new cv.MatVector();
        iris_mat_vector.push_back(right_iris_mat);
        iris_mat_vector.push_back(left_iris_mat);

        let iris_mask = new cv.Mat(dim.height, dim.width, cv.CV_8UC1, new cv.Scalar(255, 255, 255))
        cv.fillPoly(iris_mask, iris_mat_vector, new cv.Scalar(0))
        this.showResultToCanvas(iris_mask, 'eyeGray')

        //
        let result = new cv.Mat();
        cv.bitwise_or(eyes, iris_mask, result)
        this.showResultToCanvas(result, 'iris')

        // for (let i = 0; i < eyes.rows; i++) {
        //   for (let j = 0; j < eyes.cols; j++) {
        //     let index = i * eyes.cols + j;  // Calculate the 1D index
        //     if (mask.ucharAt(i, j) === 0) {
        //       // eyes.ucharSetterAt(i, j, 155);  // Set non-eye pixels to gray (155)
        //       eyes.data[index] = 155
        //     }
        //   }
        // }

        let r_max_x = Math.max(...right_eye_coords.map(p => p.x));
        let r_min_x = Math.min(...right_eye_coords.map(p => p.x));
        let r_max_y = Math.max(...right_eye_coords.map(p => p.y));
        let r_min_y = Math.min(...right_eye_coords.map(p => p.y));

        let l_max_x = Math.max(...left_eye_coords.map(p => p.x));
        let l_min_x = Math.min(...left_eye_coords.map(p => p.x));
        let l_max_y = Math.max(...left_eye_coords.map(p => p.y));
        let l_min_y = Math.min(...left_eye_coords.map(p => p.y));

        let cropped_right = result.roi(new cv.Rect(r_min_x, r_min_y, r_max_x - r_min_x, r_max_y - r_min_y));
        let cropped_left = result.roi(new cv.Rect(l_min_x, l_min_y, l_max_x - l_min_x, l_max_y - l_min_y));
        this.showResultToCanvas(cropped_right, 'rightEye')
        this.showResultToCanvas(cropped_left, 'leftEye')

        matImg.delete()
        gray.delete()
        mask.delete()
        eyes.delete()

        return [cropped_right, cropped_left];
    }

    // Position Estimator function
    positionEstimator(cropped_eye, side) {
        // console.log(cropped_eye.data)
        let h = cropped_eye.rows;
        let w = cropped_eye.cols;

        // let gaussianBlur = new cv.Mat();
        // cv.GaussianBlur(cropped_eye, gaussianBlur, new cv.Size(9, 9), 0);

        // let medianBlur = new cv.Mat();
        // cv.medianBlur(gaussianBlur, medianBlur, 3);
        //
        // this.showResultToCanvas(medianBlur, 'beforeThreshed')

        // let medianBlur = cropped_eye

        let threshed_eye = new cv.Mat();
        // 下面函数将大于130像素的值置为0,小于的置为255
        cv.threshold(cropped_eye, threshed_eye, 100, 255, cv.THRESH_BINARY);
        this.showResultToCanvas(threshed_eye, 'threshed-' + side)

        let piece = Math.floor(w / 3);

        let right_piece = threshed_eye.roi(new cv.Rect(0, 0, piece, h));
        let center_piece = threshed_eye.roi(new cv.Rect(piece, 0, piece, h));
        let left_piece = threshed_eye.roi(new cv.Rect(piece * 2, 0, piece, h));

        let result = this.pixelCounter(right_piece, center_piece, left_piece);

        // gaussianBlur.delete()
        // medianBlur.delete()
        threshed_eye.delete()

        return result;
    }

    // Pixel counter function
    pixelCounter(right_piece, center_piece, left_piece) {
        let right_pixels = this.countBlackPixels(right_piece);
        let center_pixels = this.countBlackPixels(center_piece);
        let left_pixels = this.countBlackPixels(left_piece);

        let max_pixels = Math.max(right_pixels, center_pixels, left_pixels);
        let eye_position = '';

        if (max_pixels === right_pixels) {
            eye_position = "RIGHT";
        } else if (max_pixels === center_pixels) {
            eye_position = 'CENTER';
        } else if (max_pixels === left_pixels) {
            eye_position = 'LEFT';
        } else {
            eye_position = "Closed";
        }
        return eye_position;
    }

    countBlackPixels(piece) {
        let count = 0;
        for (let i = 0; i < piece.rows; i++) {
            for (let j = 0; j < piece.cols; j++) {
                if (piece.ucharAt(i, j) === 0) {
                    count++;
                }
            }
        }
        return count;
    }



}

