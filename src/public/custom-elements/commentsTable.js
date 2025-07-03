import { create } from 'wix-custom-elements';
import wixData from 'wix-data';

// 定义您的自定义元素
create('comments-table', class extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
        }
        tr:hover {background-color: #ddd;}
      </style>
      <table id="worksTable">
        <thead>
          <tr>
            <th>Work Number</th>
            <th>Comment</th>
            <th>Score</th>
            <th>Comments Count</th>
          </tr>
        </thead>
        <tbody id="worksBody">
          <!-- Rows will be added here -->
        </tbody>
      </table>
    `;
    this.refreshTable();
  }

  refreshTable() {
    // 获取数据并更新表格
    wixData.query('BOFcomment')
      .find()
      .then(results => {
        // 根据评论数量排序
        const sortedData = results.items.sort((a, b) => b.commentsCount - a.commentsCount);
        const tbody = this.querySelector('#worksBody');
        tbody.innerHTML = sortedData.map(item => `
          <tr>
            <td>${item.workNumber}</td>
            <td>${item.comment}</td>
            <td>${item.score}</td>
            <td>${item.commentsCount}</td>
          </tr>
        `).join('');
      })
      .catch(err => {
        console.error('Error fetching data', err);
      });
  }
});
