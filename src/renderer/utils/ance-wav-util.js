// toWav.js
const fs = require('fs')

const defaultOptions = {
    outputRate: 16000,
    bitDepth: 16,
    numChannels: 1,
}

let config = {
}


// audioArray 是Int16Array类型的数据，PCM数据
export default function audioArrayToWav(audioArray, opt={}, createWavFile = true, fileName, writeToLocal = false, filePath) {
    console.info('start to convert audio data to wav')
    config = opt

    // // 1 二维转一维数组
    // let data = flat({lBuffer: audioArray, rBuffer: []})
    // // 2 压缩或扩展
    // data = compress(data, config.sampleRate, defaultOptions.outputRate)

    // 3 encode
    // let pcm = encodePCM(data, defaultOptions.outputRate, littleEdian())
    // 4 pcm to wav
    let wavData = encodeWAV(audioArray, config.sampleRate, defaultOptions.outputRate, defaultOptions.bitDepth, defaultOptions.numChannels)

    let wavFile = null
    if (createWavFile) {
        let wavBlob = new Blob([wavData], { type: 'audio/wav' })
        wavFile = new File([wavBlob],  fileName, { type: 'audio/wav' } )
        console.info('success to convert audio data to wav:', fileName)
    }

    if (writeToLocal) {
        let wavBuffer = Buffer.from(wavData.buffer)
        fs.writeFile(filePath, wavBuffer, (err) => {
            if (err) {
                console.log('writeFile err', err)
            } else {
                console.log('writeFile success')
            }
        })
    }
    return wavFile
}

// 判断端字节序
function littleEdian() {
    let buffer = new ArrayBuffer(2);
    new DataView(buffer).setInt16(0, 256, true);
    return new Int16Array(buffer)[0] === 256;
}

// 1 二维转一维数组
function flat({lBuffer, rBuffer}) {
    let lData = null,
        rData = new Float32Array(0);    // 右声道默认为0

    // 创建存放数据的容器
    if (1 === config.numChannels) {
        lData = new Float32Array(lBuffer.length * lBuffer[0].byteLength);
    } else {
        lData = new Float32Array(rBuffer.length / 2);
        rData = new Float32Array(rBuffer.length / 2);
    }
    // 合并
    let offset = 0; // 偏移量计算

    // 将二维数据，转成一维数据
    // 左声道
    for (let i = 0; i < lBuffer.length; i++) {
        lData.set(lBuffer[i], offset);
        offset += lBuffer[i].length;
    }

    offset = 0;
    // 右声道
    for (let i = 0; i < rBuffer.length; i++) {
        rData.set(rBuffer[i], offset);
        offset += rBuffer[i].length;
    }

    return {
        left: lData,
        right: rData
    };
}

/**
 * 数据合并压缩
 * 根据输入和输出的采样率压缩数据，
 * 比如输入的采样率是48k的，我们需要的是（输出）的是16k的，由于48k与16k是3倍关系，
 * 所以输入数据中每隔3取1位
 *
 * @static
 * @param {float32array} data       [-1, 1]的pcm数据
 * @param {number} inputSampleRate  输入采样率
 * @param {number} outputSampleRate 输出采样率
 * @returns  {float32array}         压缩处理后的二进制数据
 * @memberof Recorder
 */
function compress(data, inputSampleRate, outputSampleRate) {
    // 压缩，根据采样率进行压缩
    let rate = inputSampleRate / outputSampleRate,
        compression = Math.max(rate, 1),
        lData = data.left,
        rData = data.right,
        length = Math.floor(( lData.length + rData.length ) / rate),
        result = new Float32Array(length),
        index = 0,
        j = 0;

    // 循环间隔 compression 位取一位数据
    while (index < length) {
        let temp = Math.floor(j)

        result[index] = lData[temp];
        index++;

        if (rData.length) {
            /*
             * 双声道处理
             * e.inputBuffer.getChannelData(0)得到了左声道4096个样本数据，1是右声道的数据，
             * 此处需要组和成LRLRLR这种格式，才能正常播放，所以要处理下
             */
            result[index] = rData[temp];
            index++;
        }

        j += compression;
    }
    // 返回压缩后的一维数据
    return result;
}

function encodePCM(bytes, sampleBits, littleEdian = true) {
    let offset = 0,
        dataLength = bytes.length * (sampleBits / 8),
        buffer = new ArrayBuffer(dataLength),
        data = new DataView(buffer);

    // 写入采样数据
    if (sampleBits === 8) {
        for (let i = 0; i < bytes.length; i++, offset++) {
            // 范围[-1, 1]
            let s = Math.max(-1, Math.min(1, bytes[i]));
            // 8位采样位划分成2^8=256份，它的范围是0-255;
            // 对于8位的话，负数*128，正数*127，然后整体向上平移128(+128)，即可得到[0,255]范围的数据。
            let val = s < 0 ? s * 128 : s * 127;
            val = +val + 128;
            data.setInt8(offset, val);
        }
    } else {
        for (let i = 0; i < bytes.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, bytes[i]));
            // 16位的划分的是2^16=65536份，范围是-32768到32767
            // 因为我们收集的数据范围在[-1,1]，那么你想转换成16位的话，只需要对负数*32768,对正数*32767,即可得到范围在[-32768,32767]的数据。
            data.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, littleEdian);
        }
    }

    return data;
}

/** audioBuffer 转wav
 * @param {audioBuffer} samples 音频样本
 * @param {Object} opt={} 配置项 outputRate采样率 bitDepth位深 numChannels声道数
 */
function audioBufferToWav(samples, opt = {}) {
    let outputRate = opt.outputRate || defaultOptions.outputRate; // 指定输出采样率
    let bitDepth = opt.bitDepth || defaultOptions.bitDepth; // 指定位数
    let numChannels = opt.numChannels || samples.numberOfChannels || defaultOptions.numChannels; // 指定声道数
    let times = (samples.sampleRate / outputRate) >> 0; // 计算压缩率
    // 采样率压缩核心实现在这一步
    let interleaved =
        numChannels === 2? interleave(times,samples.getChannelData(0),samples.getChannelData(1))
            : interleave(times, samples.getChannelData(0));
    return encodeWAV(interleaved, samples.sampleRate, outputRate, bitDepth, numChannels);
}

/** 压缩采样率
 * @params {Number} times 压缩率
 * @params {Float32Array} inputL 左声道
 * @params {Float32Array} inputR 右声道
 */
function interleave(times, inputL, inputR) {
    let length;
    if (inputR) length = ((inputL.length + inputR.length) / times) >> 0; // 计算压缩后的数据长度
    else length = (inputL.length / times) >> 0;
    let result = new Float32Array(length);
    let index = 0,inputIndex = 0;
    while (index < length) {
        result[index++] = inputL[inputIndex];
        if (inputR) result[index++] = inputR[inputIndex];
        inputIndex += times; // 每次跳过压缩率的倍数
    }
    return result;
}

/** buffer转wav
 * @params {audioBuffer} samples 样本
 * @params {Number} outputRate 采样率
 * @params {Number} bitDepth 位深 8 16 32
 * @params {Number} numChannels 声道数
 */
function encodeWAV(pcmData, sampleRate, outputSampleRate, oututSampleBits, numChannels) {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);

    // 写入WAV文件头
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(view, 0, 'RIFF'); // ChunkID
    view.setUint32(4, 36 + pcmData.length * 2, true); // ChunkSize
    writeString(view, 8, 'WAVE'); // Format
    writeString(view, 12, 'fmt '); // Subchunk1ID
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat
    view.setUint16(22, 1, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    writeString(view, 36, 'data'); // Subchunk2ID
    view.setUint32(40, pcmData.length * 2, true); // Subchunk2Size

    // 写入PCM数据
    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(44 + i * 2, pcmData[i], true);
    }

    return view;
}
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
function floatTo8BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset++) {
        //这里只能加1了
        let s = Math.max(-1, Math.min(1, input[i]));
        let val = s < 0 ? s * 0x8000 : s * 0x7fff;
        val = parseInt(255 / (65535 / (val + 32768))); // 有人声的时候会有杂音
        // var val = ((s < 0 ? s * 0x8000 : s * 0x7fff) >> 8) + 128; // 有人声无人声都会有杂音
        output.setInt8(offset, val, true);
    }
}
function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        //因为是int16所以占2个字节,所以偏移量是+2
        let s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
}
function writeFloat32(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true);
    }
}