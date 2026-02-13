/* ============================================
   WorkerManager - Advanced Worker Pool System
   Integrates with Ultimate Local Music Player
   ============================================ */

class WorkerManager {
    constructor(debugLog, options = {}) {
        this.debugLog = debugLog || console.log;
        
        this.config = {
            maxWorkersPerType: options.maxWorkersPerType || 2,
            workerTimeout: options.workerTimeout || 30000,
            healthCheckInterval: options.healthCheckInterval || 10000,
            retryAttempts: options.retryAttempts || 2,
            retryDelay: options.retryDelay || 1000
        };
        
        // Worker pools by type
        this.pools = new Map();
        
        // Task queue
        this.taskQueue = [];
        this.activeTasks = 0;
        
        // Health monitoring
        this.healthCheckIntervals = new Map();
        
        // Statistics
        this.stats = {
            totalTasksProcessed: 0,
            totalTasksFailed: 0,
            avgProcessingTime: 0,
            processingTimes: []
        };
        
        this.debugLog('✅ WorkerManager initialized', 'success');
    }
    
    // ========== WORKER POOL CREATION ==========
    
    /**
     * Create a worker pool for a specific task type
     * @param {string} type - Worker type identifier
     * @param {Function} workerCodeGenerator - Function that returns worker code
     * @param {number} poolSize - Number of workers to create
     */
    async createPool(type, workerCodeGenerator, poolSize = null) {
        if (this.pools.has(type)) {
            this.debugLog(`⚠️ Pool '${type}' already exists`, 'warning');
            return this.pools.get(type);
        }
        
        const size = poolSize || this.config.maxWorkersPerType;
        
        const pool = {
            type: type,
            workers: [],
            available: [],
            busy: [],
            taskQueue: [],
            stats: {
                tasksProcessed: 0,
                tasksFailed: 0,
                avgTime: 0
            }
        };
        
        // Create workers
        for (let i = 0; i < size; i++) {
            const worker = await this._createWorker(type, i, workerCodeGenerator);
            pool.workers.push(worker);
            pool.available.push(worker.id);
        }
        
        this.pools.set(type, pool);
        
        // Start health monitoring
        this._startHealthCheck(type);
        
        this.debugLog(`✅ Created '${type}' pool with ${size} workers`, 'success');
        
        return pool;
    }
    
    async _createWorker(type, index, workerCodeGenerator) {
        const workerId = `${type}_${index}`;
        const workerCode = workerCodeGenerator();
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        
        const workerWrapper = {
            id: workerId,
            type: type,
            worker: worker,
            url: workerUrl,
            state: 'idle',
            currentTask: null,
            tasksProcessed: 0,
            tasksFailed: 0,
            lastHealthCheck: Date.now(),
            healthy: true,
            pendingRequests: new Map()
        };
        
        // Set up message handler
        worker.onmessage = (e) => this._handleWorkerMessage(workerWrapper, e);
        worker.onerror = (e) => this._handleWorkerError(workerWrapper, e);
        
        return workerWrapper;
    }
    
    // ========== TASK EXECUTION ==========
    
    /**
     * Execute a task on a worker from the specified pool
     * @param {string} poolType - Worker pool type
     * @param {string} action - Action to perform
     * @param {Object} data - Data to send to worker
     * @param {Array} transfers - Transferable objects
     * @returns {Promise} Result from worker
     */
    async execute(poolType, action, data = {}, transfers = []) {
        const pool = this.pools.get(poolType);
        
        if (!pool) {
            throw new Error(`Worker pool '${poolType}' does not exist`);
        }
        
        const startTime = performance.now();
        let lastError = null;
        
        // Retry logic
        for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
            try {
                if (attempt > 0) {
                    this.debugLog(
                        `🔄 Retry ${attempt}/${this.config.retryAttempts} for ${action}`,
                        'warning'
                    );
                    await this._delay(this.config.retryDelay * attempt);
                }
                
                const result = await this._executeTask(pool, action, data, transfers);
                
                // Update statistics
                const processingTime = performance.now() - startTime;
                this._updateStats(pool, processingTime, true);
                
                return result;
                
            } catch (error) {
                lastError = error;
                this._updateStats(pool, performance.now() - startTime, false);
                
                if (attempt === this.config.retryAttempts) {
                    this.debugLog(`❌ Task failed after ${attempt + 1} attempts: ${error.message}`, 'error');
                }
            }
        }
        
        throw lastError;
    }
    
    async _executeTask(pool, action, data, transfers) {
        // Get available worker
        const worker = await this._getAvailableWorker(pool);
        
        try {
            // Mark worker as busy
            this._markWorkerBusy(pool, worker);
            
            // Execute task
            const result = await this._sendToWorker(worker, action, data, transfers);
            
            return result;
            
        } finally {
            // Mark worker as available again
            this._markWorkerAvailable(pool, worker);
            
            // Process queued tasks
            this._processQueue(pool);
        }
    }
    
    async _getAvailableWorker(pool) {
        // Check if worker is available
        if (pool.available.length > 0) {
            const workerId = pool.available[0];
            return pool.workers.find(w => w.id === workerId);
        }
        
        // Wait for available worker
        return new Promise((resolve) => {
            pool.taskQueue.push(resolve);
        });
    }
    
    _markWorkerBusy(pool, worker) {
        const index = pool.available.indexOf(worker.id);
        if (index > -1) {
            pool.available.splice(index, 1);
        }
        
        if (!pool.busy.includes(worker.id)) {
            pool.busy.push(worker.id);
        }
        
        worker.state = 'busy';
    }
    
    _markWorkerAvailable(pool, worker) {
        const index = pool.busy.indexOf(worker.id);
        if (index > -1) {
            pool.busy.splice(index, 1);
        }
        
        if (!pool.available.includes(worker.id) && worker.healthy) {
            pool.available.push(worker.id);
        }
        
        worker.state = 'idle';
        worker.currentTask = null;
    }
    
    _processQueue(pool) {
        if (pool.taskQueue.length > 0 && pool.available.length > 0) {
            const resolve = pool.taskQueue.shift();
            const workerId = pool.available[0];
            const worker = pool.workers.find(w => w.id === workerId);
            resolve(worker);
        }
    }
    
    // ========== WORKER COMMUNICATION ==========
    
    _sendToWorker(worker, action, data, transfers = []) {
        return new Promise((resolve, reject) => {
            const requestId = this._generateRequestId();
            const timeout = setTimeout(() => {
                worker.pendingRequests.delete(requestId);
                reject(new Error(`Worker timeout after ${this.config.workerTimeout}ms`));
            }, this.config.workerTimeout);
            
            worker.pendingRequests.set(requestId, { resolve, reject, timeout });
            
            try {
                worker.worker.postMessage({
                    requestId: requestId,
                    action: action,
                    data: data
                }, transfers);
                
                worker.currentTask = action;
                
            } catch (error) {
                clearTimeout(timeout);
                worker.pendingRequests.delete(requestId);
                reject(error);
            }
        });
    }
    
    _handleWorkerMessage(worker, event) {
        const { requestId, result, error } = event.data;
        
        if (!requestId) {
            // Handle non-request messages (health checks, etc.)
            this._handleWorkerEvent(worker, event.data);
            return;
        }
        
        const pending = worker.pendingRequests.get(requestId);
        if (!pending) {
            this.debugLog(`⚠️ Received response for unknown request: ${requestId}`, 'warning');
            return;
        }
        
        clearTimeout(pending.timeout);
        worker.pendingRequests.delete(requestId);
        
        if (error) {
            pending.reject(new Error(error));
            worker.tasksFailed++;
        } else {
            pending.resolve(result);
            worker.tasksProcessed++;
        }
        
        worker.lastHealthCheck = Date.now();
    }
    
    _handleWorkerError(worker, error) {
        this.debugLog(`❌ Worker ${worker.id} error: ${error.message}`, 'error');
        
        worker.healthy = false;
        worker.tasksFailed++;
        
        // Reject all pending requests
        for (const [requestId, pending] of worker.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(`Worker error: ${error.message}`));
        }
        worker.pendingRequests.clear();
        
        // Try to recreate worker
        this._recreateWorker(worker);
    }
    
    _handleWorkerEvent(worker, data) {
        if (data.type === 'PONG') {
            worker.lastHealthCheck = Date.now();
            worker.healthy = true;
        }
    }
    
    // ========== HEALTH MONITORING ==========
    
    _startHealthCheck(poolType) {
        const pool = this.pools.get(poolType);
        if (!pool) return;
        
        const intervalId = setInterval(() => {
            this._performHealthCheck(pool);
        }, this.config.healthCheckInterval);
        
        this.healthCheckIntervals.set(poolType, intervalId);
    }
    
    async _performHealthCheck(pool) {
        for (const worker of pool.workers) {
            if (worker.state === 'idle') {
                try {
                    await this._sendToWorker(worker, 'PING', {});
                } catch (error) {
                    this.debugLog(`⚠️ Health check failed for ${worker.id}`, 'warning');
                    worker.healthy = false;
                    this._recreateWorker(worker);
                }
            }
        }
    }
    
    async _recreateWorker(oldWorker) {
        this.debugLog(`🔄 Recreating worker ${oldWorker.id}`, 'info');
        
        const pool = this.pools.get(oldWorker.type);
        if (!pool) return;
        
        // Terminate old worker
        oldWorker.worker.terminate();
        URL.revokeObjectURL(oldWorker.url);
        
        // Remove from pool
        const index = pool.workers.findIndex(w => w.id === oldWorker.id);
        if (index === -1) return;
        
        // Create new worker with same ID pattern
        const workerIndex = parseInt(oldWorker.id.split('_')[1]);
        const workerCodeGenerator = this._getWorkerCodeGenerator(oldWorker.type);
        
        const newWorker = await this._createWorker(oldWorker.type, workerIndex, workerCodeGenerator);
        
        // Replace in pool
        pool.workers[index] = newWorker;
        
        // Update availability
        const availIndex = pool.available.indexOf(oldWorker.id);
        if (availIndex > -1) {
            pool.available[availIndex] = newWorker.id;
        }
        
        const busyIndex = pool.busy.indexOf(oldWorker.id);
        if (busyIndex > -1) {
            pool.busy.splice(busyIndex, 1);
            pool.available.push(newWorker.id);
        }
        
        this.debugLog(`✅ Worker ${oldWorker.id} recreated`, 'success');
    }
    
    // ========== BATCH PROCESSING ==========
    
    /**
     * Process multiple tasks in parallel with concurrency control
     * @param {string} poolType - Worker pool type
     * @param {Array} tasks - Array of {action, data, transfers}
     * @param {number} maxConcurrent - Max parallel tasks (default: pool size)
     * @returns {Promise<Array>} Results
     */
    async executeBatch(poolType, tasks, maxConcurrent = null) {
        const pool = this.pools.get(poolType);
        if (!pool) {
            throw new Error(`Worker pool '${poolType}' does not exist`);
        }
        
        const concurrency = maxConcurrent || pool.workers.length;
        const results = [];
        const executing = [];
        
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            
            const promise = this.execute(
                poolType,
                task.action,
                task.data,
                task.transfers || []
            ).then(result => {
                executing.splice(executing.indexOf(promise), 1);
                return { success: true, result, index: i };
            }).catch(error => {
                executing.splice(executing.indexOf(promise), 1);
                return { success: false, error: error.message, index: i };
            });
            
            results.push(promise);
            executing.push(promise);
            
            if (executing.length >= concurrency) {
                await Promise.race(executing);
            }
        }
        
        const finalResults = await Promise.all(results);
        
        // Sort by original index
        return finalResults.sort((a, b) => a.index - b.index);
    }
    
    // ========== STATISTICS ==========
    
    _updateStats(pool, processingTime, success) {
        if (success) {
            pool.stats.tasksProcessed++;
            this.stats.totalTasksProcessed++;
            
            this.stats.processingTimes.push(processingTime);
            if (this.stats.processingTimes.length > 100) {
                this.stats.processingTimes.shift();
            }
            
            this.stats.avgProcessingTime = 
                this.stats.processingTimes.reduce((a, b) => a + b, 0) / 
                this.stats.processingTimes.length;
        } else {
            pool.stats.tasksFailed++;
            this.stats.totalTasksFailed++;
        }
    }
    
    getStats(poolType = null) {
        if (poolType) {
            const pool = this.pools.get(poolType);
            if (!pool) return null;
            
            return {
                type: poolType,
                totalWorkers: pool.workers.length,
                availableWorkers: pool.available.length,
                busyWorkers: pool.busy.length,
                queuedTasks: pool.taskQueue.length,
                tasksProcessed: pool.stats.tasksProcessed,
                tasksFailed: pool.stats.tasksFailed,
                workers: pool.workers.map(w => ({
                    id: w.id,
                    state: w.state,
                    healthy: w.healthy,
                    tasksProcessed: w.tasksProcessed,
                    tasksFailed: w.tasksFailed
                }))
            };
        }
        
        // Global stats
        return {
            totalPools: this.pools.size,
            pools: Array.from(this.pools.keys()).map(type => this.getStats(type)),
            global: {
                totalTasksProcessed: this.stats.totalTasksProcessed,
                totalTasksFailed: this.stats.totalTasksFailed,
                avgProcessingTime: this.stats.avgProcessingTime.toFixed(2) + 'ms'
            }
        };
    }
    
    // ========== CLEANUP ==========
    
    terminatePool(poolType) {
        const pool = this.pools.get(poolType);
        if (!pool) return;
        
        // Stop health check
        const intervalId = this.healthCheckIntervals.get(poolType);
        if (intervalId) {
            clearInterval(intervalId);
            this.healthCheckIntervals.delete(poolType);
        }
        
        // Terminate all workers
        for (const worker of pool.workers) {
            worker.worker.terminate();
            URL.revokeObjectURL(worker.url);
        }
        
        this.pools.delete(poolType);
        
        this.debugLog(`🗑️ Pool '${poolType}' terminated`, 'info');
    }
    
    terminateAll() {
        for (const poolType of this.pools.keys()) {
            this.terminatePool(poolType);
        }
        
        this.debugLog('🗑️ All worker pools terminated', 'info');
    }
    
    // ========== UTILITIES ==========
    
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    _getWorkerCodeGenerator(type) {
        // This should be overridden or stored when creating pool
        return WORKER_CODE_GENERATORS[type];
    }
}

// ========== WORKER CODE GENERATORS ==========

const WORKER_CODE_GENERATORS = {
    // Metadata extraction worker
    metadata: () => `
        self.onmessage = async function(e) {
            const { requestId, action, data } = e.data;
            
            try {
                if (action === 'PING') {
                    self.postMessage({ requestId, result: { type: 'PONG' } });
                    return;
                }
                
                if (action === 'EXTRACT_METADATA') {
                    const result = await extractMetadata(data.file);
                    self.postMessage({ requestId, result });
                    return;
                }
                
                self.postMessage({ requestId, error: 'Unknown action: ' + action });
                
            } catch (error) {
                self.postMessage({ requestId, error: error.message });
            }
        };
        
        async function extractMetadata(fileData) {
            // Placeholder - would use jsmediatags or similar
            return {
                title: 'Unknown',
                artist: 'Unknown',
                album: 'Unknown'
            };
        }
    `,
    
    // Audio analysis worker
    analysis: () => `
        self.onmessage = async function(e) {
            const { requestId, action, data } = e.data;
            
            try {
                if (action === 'PING') {
                    self.postMessage({ requestId, result: { type: 'PONG' } });
                    return;
                }
                
                if (action === 'ANALYZE_AUDIO') {
                    const result = await analyzeAudio(data.audioData);
                    self.postMessage({ requestId, result });
                    return;
                }
                
                self.postMessage({ requestId, error: 'Unknown action: ' + action });
                
            } catch (error) {
                self.postMessage({ requestId, error: error.message });
            }
        };
        
        async function analyzeAudio(audioData) {
            // Perform FFT, detect BPM, extract features, etc.
            const { buffer, sampleRate } = audioData;
            
            // Placeholder analysis
            return {
                bpm: 120,
                energy: 0.5,
                mood: 'neutral',
                key: 'C',
                analyzed: true
            };
        }
    `,
    
    // File processing worker
    fileProcessor: () => `
        self.onmessage = async function(e) {
            const { requestId, action, data } = e.data;
            
            try {
                if (action === 'PING') {
                    self.postMessage({ requestId, result: { type: 'PONG' } });
                    return;
                }
                
                if (action === 'PROCESS_FILE') {
                    const result = await processFile(data.file, data.type);
                    self.postMessage({ requestId, result });
                    return;
                }
                
                self.postMessage({ requestId, error: 'Unknown action: ' + action });
                
            } catch (error) {
                self.postMessage({ requestId, error: error.message });
            }
        };
        
        async function processFile(file, fileType) {
            // Process different file types
            if (fileType === 'vtt') {
                return parseVTT(file);
            } else if (fileType === 'analysis') {
                return parseAnalysis(file);
            }
            
            return { processed: true };
        }
        
        function parseVTT(text) {
            // VTT parsing logic
            return { cues: [] };
        }
        
        function parseAnalysis(text) {
            // Analysis text parsing
            return { analysis: {} };
        }
    `
};

// ========== INTEGRATION HELPERS ==========

/**
 * Create worker manager instance for music player
 */
function createMusicPlayerWorkerManager(debugLog) {
    const manager = new WorkerManager(debugLog, {
        maxWorkersPerType: 2,
        workerTimeout: 30000,
        retryAttempts: 2
    });
    
    // Pre-create common pools
    manager.createPool('metadata', WORKER_CODE_GENERATORS.metadata, 2);
    manager.createPool('analysis', WORKER_CODE_GENERATORS.analysis, 2);
    manager.createPool('fileProcessor', WORKER_CODE_GENERATORS.fileProcessor, 2);
    
    return manager;
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WorkerManager, WORKER_CODE_GENERATORS, createMusicPlayerWorkerManager };
}