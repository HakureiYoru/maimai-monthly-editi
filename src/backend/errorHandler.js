/**
 * 错误处理模块
 * 提供统一的错误处理和HTTP响应格式
 */

import { ok, badRequest, notFound, serverError, response } from 'wix-http-functions';
import { HTTP_HEADERS } from 'backend/constants';

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
            console.error('Async error:', error);
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
 * 日志错误信息
 * @param {string} operation - 操作名称
 * @param {Error} error - 错误对象
 * @param {Object} context - 错误上下文
 */
export function logError(operation, error, context = {}) {
    console.error(`Error in ${operation}:`, {
        message: error.message,
        stack: error.stack,
        context: context
    });
} 