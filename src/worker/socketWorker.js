const VideoSocketClient = require('../renderer/iflySocket/VideoSocketClient')
const BGRUtil = require('../renderer/iflySocket/BGRUtil')
const { createCanvas } = require('canvas');
const jpeg = require('jpeg-js');
const { parentPort } = require('worker_threads');

process.on('uncaughtException', (err) => {
    console.log('socket worker进程发生错误', err)
})

process.on('unhandledRejection', (reason, promise) => {
    console.log('reason', reason)
    console.log('promise', promise)
})

const ip = '192.168.110.97'
const port = '9090'
let videoSocketClient = null

const setupVideoClient = () => {
    videoSocketClient = new VideoSocketClient(ip, port)
    videoSocketClient.on('connectSuccess', ()=> {
        console.log('视频连接成功')
    })
    videoSocketClient.on('disconnect', () => {
        console.log('视频连接断开')
    })
    videoSocketClient.on('onFrameData', (videoData, frameFormat, frameW, frameH, frameDetect) => {
        // console.log('videoSocketClient receive frame data')
        parseFrameData(videoData, frameFormat, frameW, frameH, frameDetect)
    })
    videoSocketClient.connect()
}

let pixels = null
const parseFrameData = (data, format, width, height, frameDetect) => {
    // console.log(`收到视频帧信息了, format: ${format}, width: ${width}, height: ${height}`)
    if (format === 0) {
        // 1. 画人脸框 (BGR 格式处理)
        let convert = data;

        // 初始化像素数组
        if (!pixels || pixels.length !== width * height) {
            pixels = new Uint32Array(width * height);
        }

        // 转换像素数组从 BGR 到 ARGB
        for (let i = 0; i < height; i++) {
            const offset = i * width * 3;
            const colorOffset = i * width;
            for (let j = 0; j < width; j++) {
                const blue = convert[offset + j * 3]  & 0xff;
                const green = convert[offset + j * 3 + 1]  & 0xff;
                const red = convert[offset + j * 3 + 2] & 0xff;
                pixels[colorOffset + j] = (0xff << 24) | (red << 16) | (green << 8) | blue;
            }
        }

        // 创建图像对象并设置像素
        let bgrBitmap = createBitmap(width, height, pixels); // 假设 createBitmap 是您的自定义函数

        // 绘制人脸框
        if (frameDetect) {
            frameDetect.forEach((detect) => {
                if (detect && detect.hasFace) {
                    const { faceX, faceY, faceW, faceH } = detect.faceInfo;
                    BGRUtil.drawFaceLine(bgrBitmap, width, height, faceX, faceY, faceW, faceH);
                }
            });
        }

        // 更新界面
        notifyRenderer(bgrBitmap); // 假设 updateUI 是您自定义的 UI 更新函数

    } else if (format === 1) {
        // 解码图片数据为 Bitmap 格式 (假设使用 JPEG 或 PNG 数据)
        const bitmap = decodeBitmap(data); // 假设 decodeBitmap 是解码二进制图像数据的自定义函数

        // 绘制人脸框
        if (frameDetect) {
            frameDetect.forEach((detect) => {
                if (detect && detect.hasFace) {
                    const { faceX, faceY, faceW, faceH } = detect.faceInfo;
                    BGRUtil.drawFaceLine(bitmap, width, height, faceX, faceY, faceW, faceH);
                }
            });
        }

        // 更新界面
        notifyRenderer(bitmap);
    } else {
        console.error("Unknown format:", format);
    }
}

// 将像素点绘制到指定大小的canvas上
const createBitmap = (width, height, pixels) => {
    // const canvas = createCanvas(width, height);
    const canvas = OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);

    // 设置像素数据
    for (let i = 0; i < pixels.length; i++) {
        imageData.data[i] = pixels[i]; // pixels 是 Uint8ClampedArray 或类似的数组
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.transferToImageBitmap(); // 返回 Canvas 对象
}

// 将jpeg图像解压缩，还原成位图，并绘制到canvas上
const decodeBitmap = (jpegData) => {
    const rawImageData = jpeg.decode(jpegData, { useTArray: true }); // 解码为像素数据
    const { width, height, data } = rawImageData;

    const offscreenCanvas = createCanvas('canvas')
    offscreenCanvas.width = width
    offscreenCanvas.height = height
    const ctx = offscreenCanvas.getContext('2d');
    // ctx.clearRect(0, 0, width, height)
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(data); // 设置解码后的像素数据 (RGBA 格式)
    ctx.putImageData(imgData, 0, 0);
    return offscreenCanvas
}

const notifyRenderer = (bitmap) => {
    if (!bitmap) {
        return
    }

    // 将 Canvas 转换为 Buffer（PNG 格式）
    const buffer = bitmap.toBuffer('image/png');
    if (buffer.byteLength > 0) {
        // ipcRenderer.send('window-message-from-worker', {type: 'videoFrame', data: buffer})
        parentPort.postMessage({type: 'videoFrame', data: buffer})
    }
}

setupVideoClient()
