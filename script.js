// グローバル変数
let selectedCsvFile = null;
let transactions = [];
const STORAGE_KEY = 'transaction_history';

// ファイル選択時の処理
document.getElementById('csvUpload').addEventListener('change', function(event) {
    selectedCsvFile = event.target.files[0];
});

// 実行ボタンの処理
function executeCsvUpload() {
    if (!selectedCsvFile) {
        showNotification('CSVファイルを選択してください', false);
        return;
    }
    handleCsvUpload(selectedCsvFile);
}

// CSVファイル処理
function handleCsvUpload(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            // CSVの行を分割する際、金額のカンマを考慮
            const lines = text.split('\n');
            transactions = []; // 既存のデータをクリア

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                
                // 行をダブルクォートで分割して処理
                const row = lines[i];
                const columns = [];
                let current = '';
                let inQuotes = false;
                
                // 各文字を確認しながら適切に列を分割
                for (let char of row) {
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        columns.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                columns.push(current.trim());

                if (columns.length >= 5) {
                    const date = columns[1] ? columns[1].replace(/"/g, '') : '';
                    const description = columns[2] ? columns[2].replace(/"/g, '') : '';
                    
                    // 支出金額の処理
                    let expense = '';
                    const expenseMatch = columns[3] ? columns[3].match(/[0-9,]+/) : null;
                    if (expenseMatch) {
                        const expenseNum = Number(expenseMatch[0].replace(/,/g, ''));
                        expense = expenseNum > 0 ? '¥' + expenseNum.toLocaleString() : '';
                    }

                    // 入金金額の処理
                    let income = '';
                    const incomeMatch = columns[4] ? columns[4].match(/[0-9,]+/) : null;
                    if (incomeMatch) {
                        const incomeNum = Number(incomeMatch[0].replace(/,/g, ''));
                        income = incomeNum > 0 ? '¥' + incomeNum.toLocaleString() : '';
                    }

                    if (description) {
                        transactions.push({
                            date: date,
                            description: description,
                            expense: expense,
                            income: income
                        });
                    }
                }
            }

            displayTransactions(transactions);
            showNotification('CSVデータを読み込みました');
        } catch (error) {
            console.error('データ解析エラー:', error);
            showNotification('データの解析に失敗しました', false);
        }
    };

    reader.onerror = function() {
        showNotification('CSVファイルの読み込みに失敗しました', false);
    };

    reader.readAsText(file, 'Shift_JIS');
}

// 取引データの表示
function displayTransactions(data) {
    const tbody = document.getElementById('transactionBody');
    tbody.innerHTML = '';
    transactions = data;

    data.forEach((transaction, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><div class="editable" contenteditable="true" onblur="updateTransaction(${index}, 'date', this.textContent)">${transaction.date}</div></td>
            <td><div class="editable" contenteditable="true" onblur="updateTransaction(${index}, 'description', this.textContent)">${transaction.description}</div></td>
            <td><div class="editable" contenteditable="true" onblur="updateTransaction(${index}, 'expense', this.textContent)">${transaction.expense || ''}</div></td>
            <td><div class="editable" contenteditable="true" onblur="updateTransaction(${index}, 'income', this.textContent)">${transaction.income || ''}</div></td>
            <td><button class="btn" onclick="deleteRow(${index})">削除</button></td>
        `;
    });

    calculateSummary();
}

// 取引データの更新
function updateTransaction(index, field, value) {
    transactions[index][field] = value;
    calculateSummary();
}

// 新しい行の追加
function addNewRow() {
    transactions.push({
        date: '',
        description: '',
        expense: '',
        income: ''
    });
    displayTransactions(transactions);
}

// 行の削除
function deleteRow(index) {
    transactions.splice(index, 1);
    displayTransactions(transactions);
}

// 集計の計算
function calculateSummary() {
    let totalExpense = 0;
    let totalIncome = 0;

    transactions.forEach(transaction => {
        const expense = parseFloat(transaction.expense.replace(/[¥,]/g, '')) || 0;
        const income = parseFloat(transaction.income.replace(/[¥,]/g, '')) || 0;
        totalExpense += expense;
        totalIncome += income;
    });

    const balance = totalIncome - totalExpense;

    document.getElementById('totalExpense').textContent = totalExpense.toLocaleString();
    document.getElementById('totalIncome').textContent = totalIncome.toLocaleString();
    
    const balanceElement = document.getElementById('balance');
    balanceElement.textContent = balance.toLocaleString();
    balanceElement.style.color = balance < 0 ? 'red' : 'black';
}

// データの保存
function saveData() {
    const timestamp = new Date().toISOString();
    const database = firebase.database();
    
    // Firebaseに保存するデータを作成
    const saveData = {
        date: timestamp,
        transactions: transactions
    };

    // Firebase Realtime Databaseに保存
    database.ref('transactions').push(saveData)
        .then(() => {
            showNotification('データを保存しました');
            renderHistory();
        })
        .catch(error => {
            console.error('保存エラー:', error);
            showNotification('データの保存に失敗しました', false);
        });
}


// 履歴の表示
// 履歴の表示
function renderHistory() {
    const database = firebase.database();
    const historyContent = document.getElementById('historyContent');
    
    // Firebaseからデータを取得
    database.ref('transactions').once('value')
        .then((snapshot) => {
            const data = [];
            snapshot.forEach((childSnapshot) => {
                data.push({
                    key: childSnapshot.key,
                    ...childSnapshot.val()
                });
            });

            // データを表示用に処理
            historyContent.innerHTML = data.reverse().map((item, index) => {
                // 損益計算部分は既存のコードを維持
                let totalExpense = 0;
                let totalIncome = 0;
                
                item.transactions.forEach(t => {
                    const expense = parseFloat(t.expense?.replace(/[¥,]/g, '')) || 0;
                    const income = parseFloat(t.income?.replace(/[¥,]/g, '')) || 0;
                    totalExpense += expense;
                    totalIncome += income;
                });

                const balance = totalIncome - totalExpense;
                const balanceColor = balance < 0 ? 'color: red;' : 'color: black;';

                // 表示部分も既存のコードを維持
                return `
                    <div class="container" style="margin-bottom: 20px;">
                        <h3>保存日時: ${new Date(item.date).toLocaleString()}</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>お取引日</th>
                                    <th>取引内容</th>
                                    <th>支出</th>
                                    <th>入金</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${item.transactions.map(t => `
                                    <tr>
                                        <td>${t.date}</td>
                                        <td>${t.description}</td>
                                        <td>${t.expense}</td>
                                        <td>${t.income}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div class="summary" style="margin-top: 10px;">
                            <h4>損益計算</h4>
                            <p>総支出: ¥${totalExpense.toLocaleString()}</p>
                            <p>総収入: ¥${totalIncome.toLocaleString()}</p>
                            <p style="${balanceColor}">収支差額: ¥${balance.toLocaleString()}</p>
                        </div>
                        <button class="btn" onclick="deleteHistory('${item.key}')">この履歴を削除</button>
                    </div>
                `;
            }).join('');
        })
        .catch(error => {
            console.error('データ取得エラー:', error);
            showNotification('データの取得に失敗しました', false);
        });
}

// 履歴の削除
function deleteHistory(key) {
    if (!confirm('この履歴を削除してもよろしいですか？')) return;
    
    const database = firebase.database();
    database.ref('transactions').child(key).remove()
        .then(() => {
            showNotification('履歴を削除しました');
            renderHistory();
        })
        .catch(error => {
            console.error('削除エラー:', error);
            showNotification('削除に失敗しました', false);
        });
}

// タブの切り替え
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`.tab-button[onclick="showTab('${tabName}')"]`).classList.add('active');
    
    if (tabName === 'history') {
        renderHistory();
    }
}

// 通知の表示
function showNotification(message, isSuccess = true) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.backgroundColor = isSuccess ? '#4CAF50' : '#f44336';
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}

function renderTransactions(type) {
    const contentElement = document.getElementById(`${type}Content`);
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    
    // 月ごとにデータをグループ化
    const groupedData = groupDataByMonth(savedData);
    
    contentElement.innerHTML = Object.entries(groupedData)
    .sort((a, b) => {
        const dateA = a[1][0].transactions[0].date;
        const dateB = b[1][0].transactions[0].date;
        return new Date(dateB) - new Date(dateA);
    })
    .map(([month, data], index) => {
        const firstDate = data[0].transactions[0].date;
        const { totalExpense, totalIncome } = calculateMonthlyTotals(data);
        const balance = totalIncome - totalExpense;
        
        return `
            <div class="accordion-item">
                <div class="accordion-header" onclick="toggleAccordion('${type}', ${index})">
                    <span>${firstDate}</span>
                    <span>${balance < 0 ? '▼' : '▼'}</span>
                </div>
                <div class="accordion-content" id="${type}-content-${index}">
                    ${renderTransactionGroup(data, month)}
                </div>
            </div>
        `;
    }).join('');
}

function groupDataByMonth(data) {
    const grouped = {};
    data.forEach(item => {
        // 取引の最初の日付を取得
        if (item.transactions && item.transactions.length > 0) {
            const firstTransaction = item.transactions[0];
            const dateParts = firstTransaction.date.split(' ')[0].split('年');
            const year = dateParts[0];
            const month = dateParts[1].split('月')[0];
            const monthKey = `${year}年${month}月`;
            
            if (!grouped[monthKey]) {
                grouped[monthKey] = [];
            }
            grouped[monthKey].push(item);
        }
    });
    return grouped;
}

function calculateMonthlyTotals(data) {
    let totalExpense = 0;
    let totalIncome = 0;
    
    data.forEach(item => {
        item.transactions.forEach(t => {
            const expense = parseFloat(t.expense?.replace(/[¥,]/g, '')) || 0;
            const income = parseFloat(t.income?.replace(/[¥,]/g, '')) || 0;
            totalExpense += expense;
            totalIncome += income;
        });
    });
    
    return { totalExpense, totalIncome };
}

function renderTransactionGroup(data, month) {
    const { totalExpense, totalIncome } = calculateMonthlyTotals(data);
    const balance = totalIncome - totalExpense;
    const balanceColor = balance < 0 ? 'color: red;' : 'color: black;';

    const transactionsHtml = data.map(item => `
        <div class="transaction-group">
            <h4>保存日時: ${new Date(item.date).toLocaleString()}</h4>
            <table>
                <thead>
                    <tr>
                        <th>お取引日</th>
                        <th>取引内容</th>
                        <th>支出</th>
                        <th>入金</th>
                    </tr>
                </thead>
                <tbody>
                    ${item.transactions.map(t => `
                        <tr>
                            <td>${t.date}</td>
                            <td>${t.description}</td>
                            <td>${t.expense}</td>
                            <td>${t.income}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `).join('');

    return `
        ${transactionsHtml}
        <div class="monthly-summary">
            <h4>${month}の集計</h4>
            <p>総支出: ¥${totalExpense.toLocaleString()}</p>
            <p>総収入: ¥${totalIncome.toLocaleString()}</p>
            <p style="${balanceColor}">収支差額: ¥${balance.toLocaleString()}</p>
        </div>
    `;
}

function toggleAccordion(type, index) {
    const content = document.getElementById(`${type}-content-${index}`);
    const allContents = document.querySelectorAll('.accordion-content');
    
    // 他のアコーディオンを閉じる
    allContents.forEach(item => {
        if (item.id !== `${type}-content-${index}`) {
            item.classList.remove('active');
        }
    });
    
    content.classList.toggle('active');
}

// 初期化
window.onload = function() {
    renderHistory();
};
