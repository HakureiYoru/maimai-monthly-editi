import wixData from 'wix-data';
import wixUsers from 'wix-users';
import { getUserRankAndVoteWeight } from 'backend/getUserPublicInfo.jsw';
import { checkIfUserVoted, getVotingResults } from 'backend/contestManagement.jsw';
import Chart from 'chart.js/auto';


let hasSubmitted = false; // Initialize the global variable to false

$w.onReady(async function () { // Note the use of 'async' here
    $w('#submitButton').disable(); // Default disabled state for the submit button
    await checkUserSubmission(); // Wait for this to complete
    await updateChartOnPageLoad(); // 页面加载时就更新图表
    $w('#input1').onChange(input1_change);
    $w('#radioGroup').onChange(radioGroup_change);
    if (!hasSubmitted) {
        updateUserVoteWeight();
    } else {
        // 如果用户已经提交过，则隐藏提交按钮
        $w('#submitButton').hide();
    }
});

async function checkUserSubmission() {
    let userId = wixUsers.currentUser.id;

    try {
        // 调用后端函数来检查用户是否已经投票
        hasSubmitted = await checkIfUserVoted(userId);

        if (hasSubmitted) {
            $w('#submitButton').disable(); // 如果用户已投票，禁用提交按钮
            $w('#text12').text = "You've already voted.";
        }
    } catch (error) {
        console.error("Error checking user's vote submission on the client:", error);
        $w('#text12').text = "An error occurred while checking if you've voted.";
    }
}

function input1_change() {
    if (!hasSubmitted) {
        validateForm();
    } else {
        $w('#text12').text = "交过了！";
    }
}

function radioGroup_change() {
    if (!hasSubmitted) {
        validateForm();
    } else {
        $w('#text12').text = "交过了！";
    }
}

function validateForm() {
    let isNameFilled = $w('#input1').value.length > 0;
    let isOptionSelected = $w('#radioGroup').value;
    if (isNameFilled && isOptionSelected && !hasSubmitted) {
        $w('#submitButton').enable();
    } else {
        $w('#submitButton').disable();
    }
}

function updateUserVoteWeight() {
    let userId = wixUsers.currentUser.id;
    getUserRankAndVoteWeight(userId)
        .then(({ rank, voteWeight }) => {
            $w('#input2').value = String(voteWeight); // Set the read-only field to the weight
            // Now also update text12 to show both rank and weight
            $w('#text12').text = `Your rank: ${rank}, Your voting weight: ${voteWeight}`;
            // 确保提交按钮是可见的
            $w('#submitButton').show();
            validateForm(); // 再次验证表单状态，以确定是否应该启用提交按钮
        })
        .catch((error) => {
            console.error('An error occurred while fetching user vote weight:', error);
            $w('#text12').text = "Could not retrieve your voting rank or weight. You cannot vote without this information.";
            $w('#submitButton').hide(); // 隐藏提交按钮
        });
}

export function wixForms1_wixFormSubmitted(event) {
    // Assuming here that the form submission logic is handled elsewhere (e.g., in a data hook)
    $w('#submitButton').disable(); // Ensure the button is disabled after submission
    resetForm();
    $w('#text12').text = "Thanks for your vote! We're processing it.";
    hasSubmitted = true;

    // 更新图表
    updateChartOnPageLoad();

}

function resetForm() {
    $w('#input1').value = '';
    $w('#radioGroup').selectedIndex = -1;
    $w('#input2').value = ''; // Clear the read-only weight field

}


export function submitButton_click(event) {
    $w('#submitButton').disable(); // Ensure the button is disabled after submission
    $w('#submitButton').hide(); // Ensure the button is disabled after submission
}


async function updateChartOnPageLoad() {
    const votingResults = await getVotingResults();
    //console.log(votingResults);
    $w('#html1').postMessage(votingResults); // 发送包含weight分布数据的结果
    $w('#html2').postMessage(votingResults.weightData);
}