
const Mic = require('node-microphone')
const fs = require('fs')
const path = require('path')

import VAD from "webrtcvad"
const vad = new VAD(16000, 3)


const mic = new Mic({
    // sampleRate: 16000,  // audio sample rate
    // channels: 1,      // number of channels
    // threshold: 0.5,   // silence threshold (rec only)
    // endOnSilence: false,  // automatically end on silence (if supported)
    // silence: '3.0',  // seconds of silence before ending
    // audioType: 'wav',  // audio type to record
    bitwidth: 16,
    rate: 16000,
    useDataEmitter: true,
    channels: 1
});

let micStream = null;
const RECORDING_THRESHOLD = 3000; // 停止录音的阈值时间（毫秒）
let isRecording = false;
let lastVoiceTimestamp = Date.now();
let audioFile = null;
let audioStream = null;
let recordingPath = null
let uploadCallback = null

export default function startVAD(uploadFileCallback) {
    console.info('----startVAD----')
    uploadCallback = uploadFileCallback

    recordingPath = `record/recording_${Date.now()}.wav`
    audioFile = path.resolve(recordingPath);
    console.info('----audioFile----', audioFile)
    audioStream = fs.createWriteStream(audioFile, { encoding: 'binary' });

    micStream = mic.startRecording();
    micStream.pipe(audioStream)

    setTimeout(() => {
        mic.stopRecording()
        micStream.end()
    }, 10000)
}

function stopVAD() {
    stopRecording()
    micStream = null
}

function startRecording() {
    recordingPath = `record/recording_${Date.now()}.wav`
    audioFile = path.join(__dirname, recordingPath);
    audioStream = fs.createWriteStream(audioFile, { encoding: 'binary' });
    isRecording = true;
    console.log('Started recording...');
}

function stopRecording() {
    if (isRecording) {
        audioStream.end()
        isRecording = false
        console.log('Stop recording...');

        // 上传录音文件
        uploadWavFile(recordingPath)
    }
}

function uploadWavFile(wavFilePath) {
    if (!wavFilePath) {
        return
    }
    let wavFile = fs.createReadStream(path.resolve(wavFilePath))
    let param = new FormData()
    param.append('file', wavFile)

    if (uploadCallback) {
        uploadCallback(param)
    }
}

// mic.on('data', (data) => {
//     console.info('---mic data---', data.byteLength)
//     if (vad.process(data)) {
//         console.info(`voice detected`)
//         // 检测出声音
//         if (!isRecording) {
//             startRecording()
//             lastVoiceTimestamp = Date.now()
//         }
//     } else {
//         console.info(`no voice detected`)
//         // 静音
//         let now = Date.now()
//         if ((now - lastVoiceTimestamp > RECORDING_THRESHOLD) && isRecording ) {
//             stopRecording()
//         }
//     }
// })
//
// mic.on('info', (data) => {
//     console.info('---mic info---', data)
//     if (vad.process(data)) {
//         console.info(`voice detected`)
//         // 检测出声音
//         if (!isRecording) {
//             startRecording()
//             lastVoiceTimestamp = Date.now()
//         }
//     } else {
//         console.info(`no voice detected`)
//         // 静音
//         let now = Date.now()
//         if ((now - lastVoiceTimestamp > RECORDING_THRESHOLD) && isRecording ) {
//             stopRecording()
//         }
//     }
// });
//
// mic.on('error', (error) => {
//     console.info(error);
// });

