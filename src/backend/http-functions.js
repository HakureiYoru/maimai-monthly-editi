import { getEnterContest034Data } from 'backend/enterContest034Api.jsw';
import wixData from 'wix-data';
import { getFileDownloadUrlAndContent } from 'backend/getMediaDownloadUrls.jsw';
import { mediaManager } from 'wix-media-backend';
import { 
    createOptionsResponse, 
    createSuccessResponse, 
    createErrorResponse, 
    asyncErrorHandler,
    validateNumberParam,
    logError 
} from 'backend/errorHandler';
import { 
    loadAllData, 
    calculateViewedVotes, 
    isWorkApproved, 
    safeJsonParse, 
    groupByField 
} from 'backend/utils';
import { 
    FILE_TYPES, 
    APPROVAL_CONFIG, 
    COLLECTIONS, 
    CRYPTO_CONFIG 
} from 'backend/constants';

/**
 * 处理比赛列表的CORS预检请求
 */
export function options_contestList(request) {
    return createOptionsResponse();
}

/**
 * 处理比赛条目的CORS预检请求
 */
export function options_contestEntry(request) {
    return createOptionsResponse();
}

/**
 * 根据序列ID获取比赛数据
 * @param {number} sequenceId - 序列ID
 * @returns {Promise<Object|null>} 比赛数据或null
 */
export async function getEnterContest034DataBySequenceId(sequenceId) {
    try {
        const results = await wixData.query(COLLECTIONS.ENTER_CONTEST_034)
            .eq('sequenceId', sequenceId)
            .find();

        if (results.items.length > 0) {
            const item = results.items[0];
            const approvedList = safeJsonParse(item.approvedByString, []);
            const viewedList = safeJsonParse(item.viewedBy, []);
            
            const files = {
                txtFileUrl: item.inVideo的複本,
                mp3FileUrl: item.maidata的複本,
                bgFileUrl: item.track的複本,
                bgVideoUrl: item.上傳檔案欄,
                approvedBy: approvedList.length,
                viewedBy: viewedList.length
            };
            return { ...item, ...files };
        }

        return null;
    } catch (error) {
        logError('getEnterContest034DataBySequenceId', error, { sequenceId });
        return null;
    }
}

/**
 * 获取比赛列表
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_contestList = asyncErrorHandler(async (request) => {
    console.log("Request headers: ", request.headers);
    
    const data = await getEnterContest034Data();
    if (!data) {
        return createErrorResponse("Data not found", 'notFound');
    }

    const filteredData = data.map(item => {
        // 安全解析 JSON 数据
        const approvedList = safeJsonParse(item.approvedByString, []);
        const viewedList = safeJsonParse(item.viewedBy, []);
        
        const approvedCount = approvedList.length;
        const viewedCount = viewedList.length;
        
        // 计算查看数对应的投票数
        const viewedVotes = calculateViewedVotes(viewedCount);
        
        // 判断是否过审
        const isApproved = isWorkApproved(approvedCount, viewedCount);

        return {
            Title: item.firstName,
            sequenceId: item.sequenceId,
            Description: item.較長答案欄,
            AllowDownload: item.核取方塊欄,
            approvedBy: approvedCount,
            viewedBy: viewedCount,
            IsApproved: isApproved
        };
    });
    
    return createSuccessResponse(filteredData);
});

/**
 * 获取比赛条目文件
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_contestEntry = asyncErrorHandler(async (request) => {
    const sequenceId = validateNumberParam(request.path[0], 'sequenceId');
    const fileType = validateNumberParam(request.path[1], 'fileType');
    
    const data = await getEnterContest034DataBySequenceId(sequenceId);
    if (!data) {
        return createErrorResponse(`Data not found for sequenceId: ${sequenceId}`, 'notFound');
    }

    let responseContentType = 'json';
    let responseBody;

    switch (fileType) {
        case FILE_TYPES.TXT: {
            const { fileContent: txtFile } = await getFileDownloadUrlAndContent(data.txtFileUrl);
            responseContentType = 'text';
            responseBody = txtFile;
            // 注释掉的加密逻辑保留以备将来使用
            // const encryptedTxtFile = CryptoJS.AES.encrypt(txtFile, CRYPTO_CONFIG.SECRET_KEY).toString();
            // responseBody = encryptedTxtFile;
            break;
        }
        case FILE_TYPES.MP3: {
            responseBody = { downloadUrl: await mediaManager.getDownloadUrl(data.mp3FileUrl) };
            break;
        }
        case FILE_TYPES.BG: {
            responseBody = { downloadUrl: await mediaManager.getDownloadUrl(data.bgFileUrl) };
            break;
        }
        case FILE_TYPES.VIDEO: {
            responseBody = { downloadUrl: await mediaManager.getDownloadUrl(data.bgVideoUrl) };
            break;
        }
        default:
            return createErrorResponse(`Invalid file type parameter: ${fileType}`, 'badRequest');
    }

    return createSuccessResponse(responseBody, responseContentType);
});

/**
 * 获取按作品编号分组的评论
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_comments = asyncErrorHandler(async (request) => {
    const query = wixData.query(COLLECTIONS.BOF_COMMENT).ascending('workNumber');
    const allItems = await loadAllData(query);

    if (allItems.length === 0) {
        return createErrorResponse("No data found", 'notFound');
    }

    // 使用工具函数按 workNumber 进行分组，只提取 comment 字段
    const groupedByWorkNumber = groupByField(allItems, 'workNumber', 'comment');
    
    return createSuccessResponse(groupedByWorkNumber);
});






/**
 * 获取按帖子ID分组的帖子日志
 * @param {Object} request - 请求对象
 * @returns {Promise<Object>} HTTP响应
 */
export const get_postLogs = asyncErrorHandler(async (request) => {
    const query = wixData.query(COLLECTIONS.POST_LOGS).ascending('timestamp');
    const allItems = await loadAllData(query);

    if (allItems.length === 0) {
        return createErrorResponse("No data found", 'notFound');
    }

    // 使用工具函数按 postId 进行分组
    const groupedByPostId = groupByField(allItems, 'postId');
    
    return createSuccessResponse(groupedByPostId);
});
















// loadAllData函数已移到backend/utils.js中，作为通用工具函数使用