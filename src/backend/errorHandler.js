/**
 * 错误处理模块
 * 提供统一的错误处理和HTTP响应格式
 */

import { ok, badRequest, notFound, serverError, response } from 'wix-http-functions';
import { HTTP_HEADERS } from 'backend/constants.js';

/**
 * 创建CORS预检响应
 * @returns {Object} CORS预检响应
 */
export function createOptionsResponse() {
    return response({
        "status": 204,
        "headers": HTTP_HEADERS.CORS
    });
}

/**
 * 创建成功响应
 * @param {*} data - 响应数据
 * @param {string} contentType - 内容类型，'json'或'text'
 * @returns {Object} 成功响应
 */
export function createSuccessResponse(data, contentType = 'json') {
    const headers = contentType === 'text' ? HTTP_HEADERS.TEXT_CORS : HTTP_HEADERS.JSON_CORS;
    const body = contentType === 'json' ? JSON.stringify(data) : data;
    
    return ok({
        "headers": headers,
        "body": body
    });
}

/**
 * 创建错误响应
 * @param {string} message - 错误消息
 * @param {string} type - 错误类型：'notFound', 'badRequest', 'serverError'
 * @returns {Object} 错误响应
 */
export function createErrorResponse(message, type = 'serverError') {
    const errorBody = JSON.stringify({ "message": message });
    const headers = HTTP_HEADERS.JSON_CORS;

    switch (type) {
        case 'notFound':
            return notFound({
                "headers": headers,
                "body": errorBody
            });
        case 'badRequest':
            return badRequest({
                "headers": headers,
                "body": errorBody
            });
        case 'serverError':
        default:
            return serverError({
                "headers": headers,
                "body": errorBody
            });
    }
}

/**
 * 异步错误处理包装器
 * @param {Function} handler - 异步处理函数
 * @returns {Function} 包装后的处理函数
 */
export function asyncErrorHandler(handler) {
    return async (request) => {
        try {
            return await handler(request);
        } catch (error) {
            logError('AsyncErrorHandler', error, { request: request.path });
            return createErrorResponse(`An error occurred: ${error.message}`);
        }
    };
}

/**
 * 验证必需参数
 * @param {Object} params - 参数对象
 * @param {Array<string>} requiredFields - 必需字段数组
 * @throws {Error} 如果缺少必需参数则抛出错误
 */
export function validateRequiredParams(params, requiredFields) {
    const missingFields = requiredFields.filter(field => 
        params[field] === undefined || params[field] === null
    );
    
    if (missingFields.length > 0) {
        throw new Error(`Missing required parameters: ${missingFields.join(', ')}`);
    }
}

/**
 * 验证数字参数
 * @param {*} value - 要验证的值
 * @param {string} fieldName - 字段名称
 * @returns {number} 验证后的数字
 * @throws {Error} 如果不是有效数字则抛出错误
 */
export function validateNumberParam(value, fieldName) {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
        throw new Error(`Invalid ${fieldName}: must be a valid number`);
    }
    return num;
}

/**
 * 统一错误日志记录
 * @param {string} operation - 操作名称
 * @param {Error} error - 错误对象
 * @param {Object} context - 错误上下文
 */
export function logError(operation, error, context = {}) {
    const timestamp = new Date().toISOString();
    const errorInfo = {
        timestamp,
        operation,
        message: error.message,
        stack: error.stack,
        context
    };
    
    console.error(`[${timestamp}] Error in ${operation}:`, JSON.stringify(errorInfo, null, 2));
}

/**
 * 统一信息日志记录
 * @param {string} operation - 操作名称
 * @param {string} message - 日志消息
 * @param {Object} context - 上下文信息
 */
export function logInfo(operation, message, context = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${operation}: ${message}`, context);
}

/**
 * 统一警告日志记录
 * @param {string} operation - 操作名称
 * @param {string} message - 警告消息
 * @param {Object} context - 上下文信息
 */
export function logWarning(operation, message, context = {}) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] Warning in ${operation}: ${message}`, context);
}

/**
 * 安全执行函数，捕获并记录错误
 * @param {Function} func - 要执行的函数
 * @param {string} operationName - 操作名称
 * @param {*} defaultValue - 出错时的默认返回值
 * @returns {Promise<*>} 函数执行结果或默认值
 */
export async function safeExecute(func, operationName, defaultValue = null) {
    try {
        return await func();
    } catch (error) {
        logError(operationName, error);
        return defaultValue;
    }
}

/**
 * 验证用户权限
 * @param {Array} userRoles - 用户角色数组
 * @param {Array<string>} requiredRoles - 需要的角色数组
 * @returns {boolean} 是否有权限
 */
export function validateUserPermissions(userRoles, requiredRoles) {
    if (!userRoles || !Array.isArray(userRoles)) {
        return false;
    }
    
    return requiredRoles.some(requiredRole => 
        userRoles.some(userRole => userRole.title === requiredRole)
    );
}

/**
 * 创建分页查询结果
 * @param {Array} items - 数据项
 * @param {number} page - 当前页码
 * @param {number} pageSize - 每页大小
 * @returns {Object} 分页结果
 */
export function createPaginatedResponse(items, page = 1, pageSize = 20) {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = items.slice(startIndex, endIndex);
    
    return {
        items: paginatedItems,
        pagination: {
            currentPage: page,
            pageSize,
            totalItems: items.length,
            totalPages: Math.ceil(items.length / pageSize),
            hasNext: endIndex < items.length,
            hasPrevious: page > 1
        }
    };
} 