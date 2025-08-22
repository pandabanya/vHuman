const { ipcRenderer } = require('electron');
const vision = require("@mediapipe/tasks-vision");
const { FilesetResolver, FaceLandmarker } = vision;
const path = require('path');
const fs = require('fs');

// 全局标记，用于控制是否应该停止工作
let shouldStop = false;


let faceLandmarker;
let runningMode = "IMAGE";   // "IMAGE" | "VIDEO"
let modelLoadedSuccessfully = false; // 模型是否成功加载的标记
let modelLoadingInProgress = false;  // 模型是否正在加载中
let modelInitPromise = null;         // 模型初始化Promise，用于避免重复加载

// 健康监控相关变量
let healthCheckInterval = null;
let lastProcessTime = Date.now();
let processCount = 0;
let consecutiveErrors = 0;          // 连续错误计数
let lastErrorTime = 0;              // 上次错误时间
let totalProcessTime = 0;           // 总处理时间
let performanceHistory = [];        // 性能历史记录

// 更新处理统计
const updateProcessStats = () => {
    lastProcessTime = Date.now();
    processCount++;
    consecutiveErrors = 0; // 成功处理时重置错误计数
};

// 记录错误统计
const recordError = () => {
    consecutiveErrors++;
    lastErrorTime = Date.now();
    console.error(`❌ 人脸检测错误累积: ${consecutiveErrors}次`);
};

// 记录性能数据
const recordPerformance = (processingTime) => {
    performanceHistory.push({
        time: Date.now(),
        duration: processingTime
    });
    
    // 只保留最近50次记录
    if (performanceHistory.length > 50) {
        performanceHistory.shift();
    }
    
    totalProcessTime += processingTime;
};

// 获取平均性能
const getAveragePerformance = () => {
    if (performanceHistory.length === 0) return 0;
    const recent = performanceHistory.slice(-10); // 最近10次
    const avg = recent.reduce((sum, record) => sum + record.duration, 0) / recent.length;
    return Math.round(avg);
};

process.on('uncaughtException', (err) => {
    console.error('人脸检测进程发生错误', err)
})

const loadOpenCV = async () => {
    return new Promise(resolve => {
        global.Module = {
            onRuntimeInitialized: () => {
                resolve()
            }
        };
        global.cv = require('./opencv.js');
    });
}

// 新的持久化模型加载函数
const ensureFaceLandmarkerLoaded = async () => {
    // 如果模型已经成功加载，直接返回
    if (modelLoadedSuccessfully && faceLandmarker) {
        console.log('✅ FaceLandmarker模型已加载，直接使用');
        return faceLandmarker;
    }
    
    // 如果正在加载中，等待当前加载完成
    if (modelLoadingInProgress && modelInitPromise) {
        console.log('⏳ 模型正在加载中，等待完成...');
        return await modelInitPromise;
    }
    
    // 开始新的加载过程
        console.log('🔄 开始加载FaceLandmarker模型...');
    modelLoadingInProgress = true;
    modelInitPromise = createFaceLandmarker();
    
    try {
        const result = await modelInitPromise;
        modelLoadedSuccessfully = true;
        modelLoadingInProgress = false;
        console.log('✅ FaceLandmarker模型加载完成并标记为成功');
        return result;
    } catch (error) {
        modelLoadingInProgress = false;
        modelInitPromise = null;
        throw error;
    }
};

// 实际的模型创建函数（简化版）
const createFaceLandmarker = async () => {
    try {
        console.log('🤖 执行FaceLandmarker模型创建...');
        
        // 🔧 注意：TensorFlow Lite会输出 "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." 
        // 这是正常的初始化信息，不是错误
        console.log('ℹ️ TensorFlow Lite初始化信息是正常的');
        
                // 🔧 统一的WASM路径处理 - 现在文件被复制到应用根目录
        const wasmPath = 'wasm';
        console.log('🔧 使用统一WASM路径:', wasmPath, '(现在文件应该在应用根目录)');
        
        console.log('🚀 准备创建FilesetResolver，使用路径:', wasmPath);
        
        // 确保路径格式正确，特别是在Windows上
        const normalizedWasmPath = path.normalize(wasmPath);
        console.log('🔧 标准化后的WASM路径:', normalizedWasmPath);
        
        let filesetResolver;
        try {
            filesetResolver = await FilesetResolver.forVisionTasks(normalizedWasmPath);
            console.log('✅ FilesetResolver创建成功');
        } catch (resolverError) {
            console.error('❌ FilesetResolver创建失败:', resolverError);
            console.error('❌ 尝试的路径:', normalizedWasmPath);
            
            // 如果路径失败，尝试一些备用策略
            console.log('🔄 尝试备用路径策略...');
            
            const backupPaths = [
                'wasm',              // 最基本的路径（可能有效）
                './wasm',            // 当前目录的wasm
                'resources/wasm',    // 简单相对路径
                './resources/wasm',  // 带点的相对路径
                '../resources/wasm', // 上级目录
                '../../resources/wasm' // 再上一级的resources
            ];
            
            let fallbackResolver = null;
            for (const backupPath of backupPaths) {
                try {
                    console.log(`🔄 尝试备用路径: ${backupPath}`);
                    fallbackResolver = await FilesetResolver.forVisionTasks(backupPath);
                    console.log(`✅ 备用路径成功: ${backupPath}`);
                    break;
                } catch (backupError) {
                    console.log(`❌ 备用路径失败: ${backupPath} - ${backupError.message}`);
                }
            }
            
            if (!fallbackResolver) {
                throw new Error(`所有WASM路径都失败了。原始错误: ${resolverError.message}`);
            }
            
            // 使用成功的备用resolver
            filesetResolver = fallbackResolver;
        }
        
        console.log('🤖 开始创建FaceLandmarker，配置参数:', {
            modelAssetPath: "/models/face_landmarker.task",
            runningMode: runningMode,
            numFaces: 1,
            timestamp: Date.now()
        });
        
        // 🔧 简化的模型创建 - 直接创建，不进行复杂的检查和重试
        console.log('⏳ 直接创建FaceLandmarker...');
        
        faceLandmarker = await FaceLandmarker.createFromOptions(
                        filesetResolver,
                        {
                            baseOptions: {
                                modelAssetPath: "/models/face_landmarker.task"
                            },
                            runningMode: runningMode,
                            numFaces: 1
                        });
        
        console.log('✅ FaceLandmarker模型加载成功', {
            faceLandmarkerType: typeof faceLandmarker,
            hasClose: typeof faceLandmarker?.close === 'function',
            hasDetect: typeof faceLandmarker?.detect === 'function',
            timestamp: Date.now()
        });
        return faceLandmarker;
    } catch (error) {
        console.error('❌ FaceLandmarker模型加载失败:', error);
        console.error('❌ 详细错误信息:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            runningMode: runningMode,
            timestamp: Date.now()
        });
        
        // 确保faceLandmarker被重置为null
        faceLandmarker = null;
        
        // 重新抛出错误以供上层处理
        throw new Error(`FaceLandmarker创建失败: ${error.message}`);
    }
}

let onReady = () => {
    notifyRenderer({'type': 'ready', data: {}});
}

let detectFace = async (msg) => {
    const startTime = Date.now();
    
    // 首先检查是否应该停止工作
    if (shouldStop) {
        console.log('🛑 收到停止信号，停止人脸检测');
        return;
    }
    
    // 检查连续错误是否过多
    if (consecutiveErrors >= 5) {
        console.error('❌ 连续错误过多，跳过此次检测');
        recordError();
        notifyRenderer({
            type: 'irisError', 
            data: {
                message: '连续错误过多，建议重置worker',
                consecutiveErrors: consecutiveErrors,
                suggestion: 'reset'
            }
        });
        return;
    }
    
    // 🔧 使用持久化模型加载机制
    try {
        if (!faceLandmarker || !modelLoadedSuccessfully) {
            console.log('🔄 模型未加载或加载失败，尝试确保模型加载...');
            faceLandmarker = await ensureFaceLandmarkerLoaded();
        }
    } catch (modelError) {
        console.error('❌ 确保模型加载失败:', modelError);
        recordError();
        notifyRenderer({
            type:'irisError', 
            data: {
                message: '模型加载失败: ' + modelError.message,
                suggestion: '请检查模型文件和WASM文件是否存在'
            }
        });
        return;
    }
    if (msg.type === 'image' || msg.type === 'imageFromVideoToDetect') {
        let imageUrl = null;
        let canvas = null;
        let ctx = null;
        
        try {
            // console.log('开始处理图像数据...')
            
            // 验证输入数据
            if (!msg.data || msg.data.length === 0) {
                throw new Error('图像数据为空');
            }
            
            // 将 Buffer 转换为 Blob，并创建一个临时的 URL
            const blob = new Blob([msg.data], { type: 'image/jpeg' });
            imageUrl = URL.createObjectURL(blob);

            // 创建一个新的 Image 对象
            const image = new Image();
            
            // 设置图像加载超时
            const loadPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('图像加载超时'));
                }, 5000); // 5秒超时
                
                image.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                image.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('图像加载失败'));
                };
            });
            
            image.src = imageUrl;
            await loadPromise;

            // 验证图像尺寸
            if (image.width === 0 || image.height === 0) {
                throw new Error('无效的图像尺寸');
            }

            // 使用 Canvas 渲染图像
            canvas = document.createElement('canvas');
            ctx = canvas.getContext('2d');
            canvas.width = image.width;
            canvas.height = image.height;
            
            // 清除画布
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);

            // 在 Canvas 上进行人脸检测
            const detection = faceLandmarker.detect(canvas);
            // console.log('检测结果:', detection);

            let paramJSON;
            if (detection && detection.faceLandmarks && detection.faceLandmarks.length > 0) {
                const result = headIrisDetection(image, detection, canvas);
                paramJSON = JSON.stringify({
                    faceLandmarks: detection.faceLandmarks, 
                    position: result.eyePosition,
                    headPose: result.headPose
                });
                
                // 更新处理统计（成功）
                updateProcessStats();
                const processingTime = Date.now() - startTime;
                recordPerformance(processingTime);
                
                // 每100次处理后输出性能统计
                if (processCount % 100 === 0) {
                    console.log(`📊 人脸检测性能统计: 平均${getAveragePerformance()}ms, 总计${processCount}次`);
                }
            } else {
                // 没有检测到人脸，但不算错误
                const processingTime = Date.now() - startTime;
                recordPerformance(processingTime);
            }
            
            return paramJSON;
        } catch (error) {
            // 记录错误统计
            recordError();
            const processingTime = Date.now() - startTime;
            
            console.error('图像处理失败:', error);
            
            // 向主进程报告详细错误信息
            notifyRenderer({
                type: 'irisError', 
                data: {
                    message: error.message,
                    stack: error.stack,
                    timestamp: Date.now(),
                    memoryUsage: process.memoryUsage ? process.memoryUsage() : null,
                    consecutiveErrors: consecutiveErrors,
                    processingTime: processingTime,
                    averagePerformance: getAveragePerformance()
                }
            });
            
            return null;
        } finally {
            // 确保资源清理
            if (imageUrl) {
                try {
                    URL.revokeObjectURL(imageUrl);
                } catch (e) {
                    console.warn('清理imageUrl失败:', e);
                }
            }
            
            // 清理canvas资源
            if (canvas && ctx) {
                try {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    canvas.width = 0;
                    canvas.height = 0;
                } catch (e) {
                    console.warn('清理canvas失败:', e);
                }
            }
            
            // 主动触发垃圾回收（如果可用）
            if (global.gc) {
                try {
                    global.gc();
                } catch (e) {
                    // 忽略垃圾回收错误
                }
            }
        }
    }
}

let notifyRenderer = (msg) => {
    ipcRenderer.send('window-message-from-worker', msg);
}

let receiveRenderer = () => {
    // 监听停止信号
    ipcRenderer.on('shutdown-signal', () => {
        console.log('🛑 收到主进程停止信号，准备关闭worker');
        shouldStop = true;
        
        // 立即清理资源
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = null;
        }
        
        // 不调用faceLandmarker.close()，直接置空
        faceLandmarker = null;
        
        console.log('✅ iris worker已停止');
    });
    
    ipcRenderer.on('message-from-renderer', (event, args) => {
        // 如果收到停止信号，不再处理任何消息
        if (shouldStop) {
            console.log('🛑 worker已停止，忽略消息:', args?.type);
            return;
        }
        
        // console.log('收到renderer进程的消息了', args)
        
        // 处理不同类型的消息
        if (args.type === 'healthCheck') {
            // 健康检查
            const now = Date.now();
            const timeSinceLastProcess = now - lastProcessTime;
            
            notifyRenderer({
                type: 'healthStatus', 
                data: {
                    modelLoaded: !!faceLandmarker,
                    timestamp: now,
                    memoryUsage: process.memoryUsage ? process.memoryUsage() : null,
                    processCount: processCount,
                    consecutiveErrors: consecutiveErrors,
                    lastProcessTime: lastProcessTime,
                    timeSinceLastProcess: timeSinceLastProcess,
                    lastErrorTime: lastErrorTime,
                    averagePerformance: getAveragePerformance(),
                    performanceHistoryLength: performanceHistory.length,
                    isHealthy: consecutiveErrors < 5 && timeSinceLastProcess < 60000
                }
            });
            return;
        }
        
        if (args.type === 'garbageCollection') {
            // 手动垃圾回收
            try {
                if (global.gc) {
                    global.gc();
                    // console.log('🧹 手动垃圾回收完成');
                    notifyRenderer({type: 'garbageCollectionComplete', data: 'success'});
                } else {
                    // console.warn('垃圾回收不可用');
                    notifyRenderer({type: 'garbageCollectionComplete', data: 'unavailable'});
                }
            } catch (error) {
                // console.error('垃圾回收失败:', error);
                notifyRenderer({type: 'garbageCollectionComplete', data: 'failed'});
            }
            return;
        }
        
        if (args.type === 'resetWorker') {
            // 重置worker - 使用异步函数处理
            const performReset = async () => {
            try {
                console.log('🔄 开始重置iris worker...');
                
                // 🔧 持久化模型保护：只在必要时重置模型
                if (modelLoadedSuccessfully && faceLandmarker) {
                    console.log('⚠️ 检测到已成功加载的模型，跳过重置以保持稳定性');
                    console.log('ℹ️ 如果确实需要重置模型，请手动刷新页面');
                    
                    // 只重置统计信息，不重置模型
                    lastProcessTime = Date.now();
                    processCount = 0;
                    consecutiveErrors = 0;
                    lastErrorTime = 0;
                    totalProcessTime = 0;
                    performanceHistory = [];
                    
                    // 立即返回成功，不进行模型重新加载
                    notifyRenderer({
                        type: 'irisWorkerResetComplete', 
                        data: {
                            modelLoaded: true, 
                            timestamp: Date.now(),
                            success: true,
                            message: '统计信息已重置，模型保持运行'
                        }
                    });
                    return;
                } else {
                    console.log('ℹ️ 模型未加载或加载失败，将进行完整重置');
                    faceLandmarker = null;
                    modelLoadedSuccessfully = false;
                    modelLoadingInProgress = false;
                    modelInitPromise = null;
                }
                
                // 重置统计信息
                console.log('🔄 重置统计信息...');
                lastProcessTime = Date.now();
                processCount = 0;
                consecutiveErrors = 0;
                lastErrorTime = 0;
                totalProcessTime = 0;
                performanceHistory = [];
                console.log('✅ 所有统计信息已重置');
                
                // 强制垃圾回收和资源清理
                if (global.gc) {
                    try {
                        console.log('🧹 执行垃圾回收...');
                        global.gc();
                        console.log('✅ 垃圾回收完成');
                    } catch (e) {
                        console.warn('⚠️ 垃圾回收失败:', e);
                    }
                } else {
                    console.log('ℹ️ 垃圾回收不可用');
                }
                
                // 强化WASM和MediaPipe资源清理
                try {
                    console.log('🧹 开始深度清理MediaPipe和WASM资源...');
                    
                    // 1. 清理全局WASM模块引用
                    if (typeof global !== 'undefined' && global.Module) {
                        console.log('🔧 检测到全局WASM模块，尝试清理...');
                        try {
                            // 不直接删除Module，可能导致其他问题
                            // delete global.Module;
                            console.log('🔧 WASM模块引用保持，等待自然回收');
                        } catch (e) {
                            console.warn('⚠️ WASM模块清理警告:', e.message);
                        }
                    }
                    
                    // 2. 清理可能的MediaPipe缓存
                    if (typeof window !== 'undefined') {
                        // 清理可能的MediaPipe相关缓存
                        console.log('🧹 清理浏览器端MediaPipe缓存...');
                    }
                    
                    // 3. 强制多次垃圾回收
                    if (global.gc) {
                        console.log('🧹 执行多轮垃圾回收...');
                        for (let i = 0; i < 3; i++) {
                            try {
                                global.gc();
                                console.log(`✅ 第${i+1}轮垃圾回收完成`);
                                // 每轮之间稍作等待
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } catch (e) {
                                console.warn(`⚠️ 第${i+1}轮垃圾回收失败:`, e);
                            }
                        }
                    }
                    
                    // 4. 等待资源完全释放
                    console.log('⏳ 等待WASM/MediaPipe资源完全释放（5秒）...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    console.log('✅ 资源清理等待完成');
                    
                } catch (cleanupError) {
                    console.error('❌ 资源清理时出现严重异常:', cleanupError);
                    console.error('❌ 异常详情:', {
                        message: cleanupError.message,
                        stack: cleanupError.stack
                    });
                }
                
                // 重新初始化faceLandmarker - 添加超时保护
                console.log('🚀 开始重新初始化faceLandmarker...');
                
                // 创建超时Promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('faceLandmarker初始化超时（30秒）'));
                    }, 30000);
                });
                
                // 创建更安全的延迟初始化Promise
                const delayedInit = new Promise(async (resolve, reject) => {
                    try {
                        console.log('⏳ 延迟8秒后开始重新初始化，确保资源完全释放...');
                        
                        // 发送进度通知
                        notifyRenderer({
                            type: 'irisWorkerResetProgress',
                            data: {
                                stage: 'waiting',
                                message: '等待资源完全释放...',
                                timestamp: Date.now()
                            }
                        });
                        
                        // 延长等待时间，确保WASM资源完全释放
                        await new Promise(resolveDelay => setTimeout(resolveDelay, 8000));
                        
                        console.log('🚀 开始重新初始化FaceLandmarker...');
                        
                        // 发送进度通知
                        notifyRenderer({
                            type: 'irisWorkerResetProgress',
                            data: {
                                stage: 'initializing',
                                message: '正在重新初始化FaceLandmarker...',
                                timestamp: Date.now()
                            }
                        });
                        
                        // 🔧 使用持久化加载机制重新初始化
                        try {
                            console.log('🔄 使用持久化机制重新加载模型...');
                            
                            // 使用持久化加载机制
                            const newFaceLandmarker = await ensureFaceLandmarkerLoaded();
                            resolve(newFaceLandmarker);
                            
                        } catch (initError) {
                            console.error('❌ 重新初始化失败:', initError);
                            reject(initError);
                        }
                        
                    } catch (error) {
                        console.error('❌ 延迟初始化过程失败:', error);
                        reject(error);
                    }
                });
                
                // 使用Promise.race来实现超时控制
                Promise.race([delayedInit, timeoutPromise])
                    .then(() => {
                        console.log('✅ iris worker重置成功', {
                            faceLandmarkerExists: !!faceLandmarker,
                            timestamp: Date.now()
                        });
                        
                        // 重置成功后立即发送ready消息
                        notifyRenderer({'type': 'ready', data: {}});
                        notifyRenderer({
                            type: 'irisWorkerResetComplete', 
                            data: {
                                modelLoaded: !!faceLandmarker, 
                                timestamp: Date.now(),
                                success: true
                            }
                        });
                    })
                    .catch((error) => {
                        console.error('❌ iris worker重置失败:', error);
                        console.error('❌ 错误详情:', {
                            message: error.message,
                            stack: error.stack,
                            name: error.name
                        });
                        
                        notifyRenderer({
                            type: 'irisWorkerResetFailed', 
                            data: {
                                message: error.message || '未知错误',
                                timestamp: Date.now(),
                                errorType: error.name || 'Unknown'
                            }
                        });
                    });
            } catch (error) {
                console.error('❌ iris worker重置失败:', error);
                notifyRenderer({
                    type: 'irisWorkerResetFailed', 
                    data: {
                        message: error.message || '重置过程异常',
                        timestamp: Date.now(),
                        errorType: error.name || 'Unknown'
                    }
                });
            }
            }; // 结束 performReset 异步函数
            
            // 执行异步重置
            performReset().catch((error) => {
                console.error('❌ 异步重置执行失败:', error);
                notifyRenderer({
                    type: 'irisWorkerResetFailed', 
                    data: {
                        message: `异步重置失败: ${error.message}`,
                        timestamp: Date.now(),
                        errorType: 'AsyncExecutionError'
                    }
                });
            });
            
            return;
        }
        
        // 处理人脸检测请求
        detectFace(args).then((result) => {
            notifyRenderer({type:'irisResult', data:result})
        }).catch((error) => {
            // console.error('detectFace Promise rejected:', error);
            notifyRenderer({
                type: 'irisError', 
                data: {
                    message: 'detectFace Promise rejected: ' + error.message,
                    timestamp: Date.now()
                }
            });
        });
    })
}



const leftCenterIndex = 473   // 左眼虹膜中心点索引
const rightCenterIndex = 468  // 右眼虹膜中心点索引
const leftInnerIndex = 362    // 左眼内眼角索引
const leftOuterIndex = 263    // 左眼外眼角索引
const rightInnerIndex = 133   // 右眼内眼角索引
const rightOuterIndex = 33    // 右眼外眼角索引
const leftEyeKeyIndex = [33, 133, 159, 145]
const rightEyeKeyIndex = [362, 263, 386, 374]

function headIrisDetection(image, detection, canvas) {
    // LEFT  CENTER RIGHT  NONE
    let eyePosition = "NONE"
    let headPoseInfo = null;
    
    if (detection && detection.faceLandmarks && detection.faceLandmarks.length > 0) {
        let angle = processHeadPose(image, detection.faceLandmarks)
        let pitch = parseFloat(angle[0])
        let yaw = parseFloat(angle[1])
        let roll = parseFloat(angle[2])
        
        // 保存头部姿态信息
        headPoseInfo = { pitch, yaw, roll };
        
        // 【临时修改】放宽头部姿态判断条件，只要不是偏得太离谱都可以被拾音设备获取到音频
        // 原来的条件：(yaw >= -45 && yaw <= 45) && (roll >= -35 && roll <= 35) && (pitch >= -30 && pitch <= 30)
        // 新条件：大幅放宽角度限制
        if ((yaw >= -50 && yaw <= 50) && (roll >= -45 && roll <= 45) && (pitch >= -45 && pitch <= 45)) {
            // 【临时修改】注释掉眼球正视的判断，暂时不需要
            // eyePosition = calcEyesPosition(image, detection.faceLandmarks[0], canvas)
            // 直接设置为CENTER，表示可以进行交互
            // 注意：需要返回与2d-human.vue期望的数据格式一致的对象
            eyePosition = { right: 'CENTER', left: 'CENTER' }
        } else {
            eyePosition = "NONE"; // 明确设置为NONE
        }
    }
    
    return {
        eyePosition: eyePosition,
        headPose: headPoseInfo
    }
}

// 计算眼睛位置
function calcEyesPosition(image, landMarks, canvas) {
    let right_eye = null;
    let left_eye = null;
    
    try {
        const leftCoords = eyeCoordsExtractor(landMarks, 'left', canvas.width, canvas.height)
        const rightCoords = eyeCoordsExtractor(landMarks, 'right', canvas.width, canvas.height)

        if (!leftCoords || !rightCoords) {
            throw new Error('无法提取眼部坐标');
        }

        const [right_eye_result, left_eye_result] = eyesExtractor(image, rightCoords[0], leftCoords[0], rightCoords[1], leftCoords[1])
        right_eye = right_eye_result;
        left_eye = left_eye_result;

        // Estimate eye position (gaze direction)
        const eye_position_right = positionEstimator(right_eye);
        const eye_position_left = positionEstimator(left_eye);
        // console.log(`右眼方向: ${eye_position_right}, 左眼方向：${eye_position_left}`)
        
        return { right: eye_position_right, left: eye_position_left }
    } catch (error) {
        console.error('眼睛位置计算失败:', error);
        return { right: 'NONE', left: 'NONE' };
    } finally {
        // 清理eyesExtractor返回的OpenCV对象
        try {
            if (right_eye) right_eye.delete();
            if (left_eye) left_eye.delete();
        } catch (cleanupError) {
            console.warn('眼睛位置计算资源清理失败:', cleanupError);
        }
    }
}

function processHeadPose(inputImage, faceLandmarks) {
    // console.log(`inputImage.width: ${inputImage.width}, height: ${inputImage.height}`)
    let canvas = document.getElementById('headPose')
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = inputImage.width
        canvas.height = inputImage.height
    }

    // 初始化所有需要清理的OpenCV Mat对象
    let originImg = null;
    let bgrImg = null;
    let faceCoordImageMat = null;
    let faceCoordRealMat = null;
    let camMatrix = null;
    let distMatrix = null;
    let rvec = null;
    let tvec = null;
    let rotationMatrix = null;

    try {
        // 转换 RGB 回 BGR
        originImg = cv.imread(inputImage);
        bgrImg = new cv.Mat();
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
            faceCoordImageMat = cv.matFromArray(
                faceCoordinationInImage.length,
                2,
                cv.CV_64FC1,
                faceCoordinationInImage.flat()
            );
            faceCoordRealMat = cv.matFromArray(
                faceCoordinationInRealWorld.length,
                3,
                cv.CV_64FC1,
                faceCoordinationInRealWorld.flat()
            );

            const focalLength = canvas.width;
            // 相机的内参矩阵
            camMatrix = cv.matFromArray(3, 3, cv.CV_64FC1, [
                focalLength, 0, canvas.width / 2,
                0, focalLength, canvas.height / 2,
                0, 0, 1
            ]);
            // 畸变系数矩阵
            distMatrix = new cv.Mat.zeros(4, 1, cv.CV_64FC1);

            // solvePnP
            rvec = new cv.Mat(); // 旋转向量
            tvec = new cv.Mat(); // 平移向量
            let result = cv.solvePnP(
                faceCoordRealMat,
                faceCoordImageMat,
                camMatrix,
                distMatrix,
                rvec,
                tvec
            );
                    // console.log(`空间转换是否成功：`, result)
        // if (result) {
        //     console.log(`旋转矩阵`, rvec)
        //     console.log(`平移矩阵`, tvec)
        // }
            // Rodrigues 转换成欧拉角
            rotationMatrix = new cv.Mat();
            cv.Rodrigues(rvec, rotationMatrix);

            const angles = rotationMatrixToAngles(rotationMatrix.data64F);

            // pitch: 抬头或低头   yaw: 左右转动   roll: 头部倾斜
            ['pitch', 'yaw', 'roll'].forEach((name, i) => {
                const text = `${name}: ${Math.round(angles[i])}`;
                cv.putText(
                    bgrImg,
                    text,
                    { x: 20, y: i * 30 + 20 },
                    cv.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    [200, 0, 200, 255],
                    2
                );
            });
            
            return angles;
        }
    } catch (error) {
        console.error('头部姿态处理失败:', error);
        throw error;
    } finally {
        // 确保清理所有OpenCV Mat对象
        try {
            if (originImg) originImg.delete();
            if (bgrImg) bgrImg.delete();
            if (faceCoordImageMat) faceCoordImageMat.delete();
            if (faceCoordRealMat) faceCoordRealMat.delete();
            if (camMatrix) camMatrix.delete();
            if (distMatrix) distMatrix.delete();
            if (rvec) rvec.delete();
            if (tvec) tvec.delete();
            if (rotationMatrix) rotationMatrix.delete();
        } catch (cleanupError) {
            console.warn('OpenCV资源清理失败:', cleanupError);
        }
    }
}
// 将旋转角度转为度数
function rotationMatrixToAngles(rotationMatrix) {
    const x = Math.atan2(rotationMatrix[7], rotationMatrix[8]);
    const y = Math.atan2(
        -rotationMatrix[6],
        Math.sqrt(Math.pow(rotationMatrix[0], 2) + Math.pow(rotationMatrix[3], 2))
    );
    const z = Math.atan2(rotationMatrix[3], rotationMatrix[0]);
    return [x, y, z].map(angle => angle * 180 / Math.PI);
}

// const eyeCoordsExtractor = (landMarks, side, width, height) => {
//     if (!landMarks) {
//         return
//     }
//     let eyeConnect;
//     if (side === 'left') {
//         eyeConnect = FaceLandmarker.FACE_LANDMARKS_LEFT_EYE
//     } else {
//         eyeConnect = FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE
//     }

//     let eyeIndex = []
//     let eyeCoords = []
//     eyeConnect.forEach(index => {
//         if (eyeIndex.indexOf(index.start) === -1) {
//             eyeIndex.push(index.start)
//         }
//         if (eyeIndex.indexOf(index.end) === -1) {
//             eyeIndex.push(index.end)
//         }
//     })
//     // console.log(`${side} eye index: `, eyeIndex)
//     eyeCoords = eyeIndex.map(index => {
//         return {'x':landMarks[index].x * width, 'y': landMarks[index].y * height }
//     })
//     // console.log(`${side} eye coords: `, eyeCoords)
//     return eyeCoords
// }
const eyeCoordsExtractor = (landMarks, side, width, height) => {
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
    // console.log(side + 'eyeIris', irisConnect)
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

    // console.log(`${side} eye index: `, eyeIndex)
    eyeCoords = eyeIndex.map(index => {
        return { 'x': landMarks[index].x * width, 'y': landMarks[index].y * height }
    })
    // console.log(`${side} eye coords: `, eyeCoords)

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
    // console.log(`${side} iris index: `, irisIndex)
    let irisCords = irisIndex.map(index => {
        let y = landMarks[index].y * height
        if (y > y_max) {
            y = y_max
        }
        if (y < y_min) {
            y = y_min
        }
        return { 'x': landMarks[index].x * width, 'y': y }
    })
    // console.log(`${side} iris coords: `, irisCords)

    return [eyeCoords, irisCords]
}


// 获取眼睛区域
const getEyeRegion = (eye, canvas) => {
    // 将眼睛的坐标转换为 OpenCV 可识别的 cv.Point 对象
    const eyePoints = eye.map((point) => new cv.Point(point.x * canvas.width, point.y * canvas.height));
    // 转换为 Mat 类型，这样可以确保 boundingRect 可以正常工作
    const eyePointsMat = cv.matFromArray(eyePoints.length, 1, cv.CV_32SC2, eyePoints.flat());
    // console.log(`eyePointsMat`, eyePointsMat)
    // 使用 cv.boundingRect 获取眼睛的外接矩形
    const rect = cv.boundingRect(eyePointsMat);
    // console.log(`rect`, rect)
    // 使用 OpenCV.js 进行区域截取和绘制
    const mat = cv.imread(canvas);

    const result = mat.roi(rect);
    return result
};

// 分析瞳孔分布
const analyzePupilDistribution = (eyeRegion, eyeSections, side) => {
    let leftPixels = 0;
    let centerPixels = 0;
    let rightPixels = 0;

    // 使用 OpenCV.js 或直接处理像素数据来判断
    for (let y = 0; y < eyeRegion.height; y++) {
        for (let x = 0; x < eyeRegion.width; x++) {
            const pixelColor = eyeRegion.get(x, y);
            if (pixelColor[0] < 50 && pixelColor[1] < 50 && pixelColor[2] < 50) {
                // 黑色像素（瞳孔）
                if (x < eyeRegion.width / 3) {
                    leftPixels++;
                } else if (x < (2 * eyeRegion.width) / 3) {
                    centerPixels++;
                } else {
                    rightPixels++;
                }
            }
        }
    }

    // 更新分布
    eyeSections[side] = { left: leftPixels, center: centerPixels, right: rightPixels };
};
// 通过坐标获取多边形数组
function getPolyMatFromCoords(eye_coords) {
    let points = convertToCvPoints(eye_coords)
    // 多边形
    let eye_mat = cv.matFromArray(points.length, 1, cv.CV_32SC2, points.flatMap(p => [p.x, p.y]));
    return eye_mat
}
function convertToCvPoints(coords) {
    return coords.map(coord => new cv.Point(coord.x, coord.y));
}

// Eyes Extractor function
function eyesExtractor(img, right_eye_coords, left_eye_coords, right_iris_coords, left_iris_coords) {
    // 初始化所有需要清理的OpenCV对象
    let matImg = null;
    let gray = null;
    let mask = null;
    let right_eye_mat = null;
    let left_eye_mat = null;
    let matVector = null;
    let eyes = null;
    let right_iris_mat = null;
    let left_iris_mat = null;
    let iris_mat_vector = null;
    let iris_mask = null;
    let result = null;
    let cropped_right = null;
    let cropped_left = null;

    try {
        matImg = cv.imread(img);
        gray = new cv.Mat();
        cv.cvtColor(matImg, gray, cv.COLOR_BGR2GRAY);

        let dim = gray.size();

        mask = new cv.Mat.zeros(dim.height, dim.width, cv.CV_8UC1);

        // 多边形
        right_eye_mat = getPolyMatFromCoords(right_eye_coords)
        left_eye_mat = getPolyMatFromCoords(left_eye_coords)

        //Step 6: Wrap the eye points in a cv.MatVector
        matVector = new cv.MatVector();
        matVector.push_back(right_eye_mat);
        matVector.push_back(left_eye_mat);
        // Step 7: Fill the mask with white (255) for the eye regions
        cv.fillPoly(mask, matVector, new cv.Scalar(255, 255, 255));

        // Step 8: Apply the mask to the grayscale image to extract the eye regions
        eyes = new cv.Mat();
        cv.bitwise_and(gray, gray, eyes, mask);

        // 虹膜处理
        right_iris_mat = getPolyMatFromCoords(right_iris_coords);
        left_iris_mat = getPolyMatFromCoords(left_iris_coords);

        iris_mat_vector = new cv.MatVector();
        iris_mat_vector.push_back(right_iris_mat);
        iris_mat_vector.push_back(left_iris_mat);

        iris_mask = new cv.Mat(dim.height, dim.width, cv.CV_8UC1, new cv.Scalar(255, 255, 255))
        cv.fillPoly(iris_mask, iris_mat_vector, new cv.Scalar(0))

        result = new cv.Mat();
        cv.bitwise_or(eyes, iris_mask, result)

        let r_max_x = Math.max(...right_eye_coords.map(p => p.x));
        let r_min_x = Math.min(...right_eye_coords.map(p => p.x));
        let r_max_y = Math.max(...right_eye_coords.map(p => p.y));
        let r_min_y = Math.min(...right_eye_coords.map(p => p.y));

        let l_max_x = Math.max(...left_eye_coords.map(p => p.x));
        let l_min_x = Math.min(...left_eye_coords.map(p => p.x));
        let l_max_y = Math.max(...left_eye_coords.map(p => p.y));
        let l_min_y = Math.min(...left_eye_coords.map(p => p.y));

        cropped_right = result.roi(new cv.Rect(r_min_x, r_min_y, r_max_x - r_min_x, r_max_y - r_min_y));
        cropped_left = result.roi(new cv.Rect(l_min_x, l_min_y, l_max_x - l_min_x, l_max_y - l_min_y));

        // 返回前清理中间对象，但保留返回的结果
        matImg.delete();
        gray.delete();
        mask.delete();
        right_eye_mat.delete();
        left_eye_mat.delete();
        matVector.delete();
        eyes.delete();
        right_iris_mat.delete();
        left_iris_mat.delete();
        iris_mat_vector.delete();
        iris_mask.delete();
        result.delete();

        return [cropped_right, cropped_left];
    } catch (error) {
        console.error('眼部提取失败:', error);
        
        // 发生错误时清理所有资源
        try {
            if (matImg) matImg.delete();
            if (gray) gray.delete();
            if (mask) mask.delete();
            if (right_eye_mat) right_eye_mat.delete();
            if (left_eye_mat) left_eye_mat.delete();
            if (matVector) matVector.delete();
            if (eyes) eyes.delete();
            if (right_iris_mat) right_iris_mat.delete();
            if (left_iris_mat) left_iris_mat.delete();
            if (iris_mat_vector) iris_mat_vector.delete();
            if (iris_mask) iris_mask.delete();
            if (result) result.delete();
            if (cropped_right) cropped_right.delete();
            if (cropped_left) cropped_left.delete();
        } catch (cleanupError) {
            console.warn('眼部提取清理失败:', cleanupError);
        }
        
        throw error;
    }
}

// Position Estimator function
function positionEstimator(cropped_eye, side) {
    let threshed_eye = null;
    let right_piece = null;
    let center_piece = null;
    let left_piece = null;

    try {
        let h = cropped_eye.rows;
        let w = cropped_eye.cols;

        threshed_eye = new cv.Mat();
        // 下面函数将大于130像素的值置为0,小于的置为255
        cv.threshold(cropped_eye, threshed_eye, 100, 255, cv.THRESH_BINARY);

        let piece = Math.floor(w / 3);

        right_piece = threshed_eye.roi(new cv.Rect(0, 0, piece, h));
        center_piece = threshed_eye.roi(new cv.Rect(piece, 0, piece, h));
        left_piece = threshed_eye.roi(new cv.Rect(piece * 2, 0, piece, h));

        let result = pixelCounter(right_piece, center_piece, left_piece);

        return result;
    } catch (error) {
        console.error('位置估算失败:', error);
        throw error;
    } finally {
        // 清理资源
        try {
            if (right_piece) right_piece.delete();
            if (center_piece) center_piece.delete();
            if (left_piece) left_piece.delete();
            if (threshed_eye) threshed_eye.delete();
        } catch (cleanupError) {
            console.warn('位置估算资源清理失败:', cleanupError);
        }
    }
}

// Pixel counter function
function pixelCounter(right_piece, center_piece, left_piece) {
    let right_pixels = countBlackPixels(right_piece);
    let center_pixels = countBlackPixels(center_piece);
    let left_pixels = countBlackPixels(left_piece);

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

// Helper function to count black pixels (black pixels = 0)
function countBlackPixels(piece) {
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

// 定期资源清理和健康检查
const startHealthMonitor = () => {
    // 每30秒进行一次健康检查和资源清理
    healthCheckInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastProcess = now - lastProcessTime;
        
        // console.log(`🏥 健康检查: 上次处理${Math.round(timeSinceLastProcess/1000)}秒前, 处理次数: ${processCount}`);
        
        // 如果长时间没有处理图像，主动触发垃圾回收
        if (timeSinceLastProcess > 60000 && global.gc) {
            // console.log('🧹 长时间无活动，执行垃圾回收');
            try {
                global.gc();
            } catch (e) {
                // console.warn('垃圾回收失败:', e);
            }
        }
        
        // 报告健康状态
        const memoryUsage = process.memoryUsage ? process.memoryUsage() : null;
        notifyRenderer({
            type: 'healthStatus',
            data: {
                modelLoaded: !!faceLandmarker,
                timestamp: now,
                memoryUsage: memoryUsage,
                processCount: processCount,
                lastProcessTime: lastProcessTime
            }
        });
        
    }, 30000); // 30秒间隔
};

// 🔧 使用新的持久化加载机制初始化
ensureFaceLandmarkerLoaded().then(() => {
    console.log('✅ FaceLandmarker模型持久化加载成功')
    loadOpenCV().then(() => {
        onReady()
        receiveRenderer()
        startHealthMonitor()
        console.log('✅ 所有组件初始化完成，系统准备就绪')
    })
}).catch(error => {
    console.error('❌ 初始化失败:', error);
    // 即使初始化失败，也要启动基础组件
    loadOpenCV().then(() => {
        onReady()
        receiveRenderer()
        startHealthMonitor()
        console.log('⚠️ 模型加载失败，但基础组件已启动')
    })
})

// 清理定时器
process.on('exit', () => {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
});

process.on('SIGINT', () => {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    process.exit();
});

process.on('SIGTERM', () => {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    process.exit();
});