// app.js

let debtChart = null;
let originalDebtChart = null;
let retirementChart = null;

function formatMonthYear(date) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${month}-${year}`;
}

// A fixed palette of 7 colors
const colorPalette = [
    '#FF6633', // orange-ish
    '#006400', // dark green
    '#FF33FF', // magenta
    '#FFD700', // gold (bright yellow)
    '#00B3E6', // teal
    '#A020F0', // purple
    '#3366E6', // blue
    '##FEFEFE'  // dark gray
];

// Keep track of which color index we're on
let colorIndex = 0;

/**
 * Returns a color from colorPalette in sequence.
 * After reaching the last color, restarts from the beginning.
 */
function getRandomColor() {
    const color = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
    return color;
}

function runCalculations() {
    const debts = [];
    const consolidatedDebts = [];
    let consolidateTotal = 0;

    document.querySelectorAll('#debtTable tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td input');
        const debt = {
            order: parseInt(cells[0].value),
            debt: cells[1].value,
            balance: parseFloat(cells[2].value),
            rate: parseFloat(cells[3].value) / 100,
            payment: parseFloat(cells[4].value),
            consolidate: cells[5].checked
        };
        debts.push(debt);

        if (debt.consolidate) {
            consolidateTotal += debt.balance;
        } else {
            consolidatedDebts.push(debt);
        }
    });

    const refinanceRateInput = document.getElementById('refiRate');
    const refinanceTermInput = document.getElementById('refiTerm');
    const principalOutput = document.getElementById('refiPrincipal');
    const paymentOutput = document.getElementById('refiPayment');

    let refiLoan = null;

    if (refinanceRateInput && refinanceTermInput && principalOutput && paymentOutput) {
        const refinanceRate = parseFloat(refinanceRateInput.value) / 100;
        const refinanceTermYears = parseInt(refinanceTermInput.value);
        const n = refinanceTermYears * 12;
        const monthlyRate = refinanceRate / 12;

        if (consolidateTotal > 0) {
            const monthlyPayment = consolidateTotal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n));
            principalOutput.value = consolidateTotal.toFixed(2);
            paymentOutput.value = monthlyPayment.toFixed(2);

            refiLoan = {
                debt: "Refinanced Loan",
                balance: consolidateTotal,
                rate: refinanceRate,
                payment: monthlyPayment
            };

            consolidatedDebts.push(refiLoan);
        }
    }

    const retirement = {};
    document.querySelectorAll('#retirementTable tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        const key = cells[0].textContent.trim();
        const value = cells[1].querySelector('input').value;
        retirement[key] =
            key === 'Retirement Ages'
                ? value.split(',').map(age => parseInt(age, 10))
                : parseFloat(value);
    });

    const extraPaymentStartYear = parseInt(document.getElementById('extraPaymentStartYear').value);
    const extraPaymentAmount = parseFloat(document.getElementById('extraPaymentAmount').value);

    plotDebtBurndown(consolidatedDebts, extraPaymentStartYear, extraPaymentAmount, 'debtChart', 'debtChart');
    plotDebtBurndown(debts, extraPaymentStartYear, extraPaymentAmount, 'originalDebtChart', 'originalDebtChart');
    plotRetirementForecast(retirement);
}

function plotDebtBurndown(debts, extraPaymentStartYear, extraPaymentAmount, canvasId, chartVarName) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (chartVarName === 'debtChart' && debtChart) debtChart.destroy();
    if (chartVarName === 'originalDebtChart' && originalDebtChart) originalDebtChart.destroy();

    const maxIterations = 360;
    const labels = [];
    let datePointer = new Date();
    for (let i = 0; i < maxIterations; i++) {
        labels.push(formatMonthYear(datePointer));
        datePointer.setMonth(datePointer.getMonth() + 1);
    }

    // Sort debts by order
    debts.sort((a, b) => a.order - b.order);

    const debtHistory = debts.map(debt => ({ ...debt, history: [] }));
    let finalIndex = maxIterations;
    const extraStart = extraPaymentStartYear * 12;
    let totalInterestPaid = 0;

    for (let i = 0; i < maxIterations; i++) {
        let snowball = 0;
        if (i >= extraStart) snowball += extraPaymentAmount;

        debtHistory.forEach(d => {
            if (d.balance <= 0) snowball += d.payment;
        });

        for (let d of debtHistory) {
            if (d.balance <= 0) continue;
            const interest = d.balance * d.rate / 12;
            totalInterestPaid += interest;
            const principal = d.payment + snowball - interest;
            snowball = 0;
            if (principal >= d.balance) {
                d.history.push(0);
                d.balance = 0;
            } else {
                d.balance -= principal;
                d.history.push(d.balance);
            }
        }

        if (debtHistory.every(d => d.balance <= 0)) {
            finalIndex = i + 1;
            break;
        }
    }

    labels.length = finalIndex;

    const datasets = debtHistory.map(d => ({
        label: d.debt,
        data: d.history.slice(0, finalIndex),
        fill: false,
        borderColor: getRandomColor()
    }));

    const newChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 2,
            plugins: {
                legend: { position: 'top' },
                title: {
                    display: true,
                    text: `Total Interest Paid: $${Math.round(totalInterestPaid).toLocaleString()}`
                }
            },
            elements: {
                point: { radius: 0 }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Balance ($)'
                    }
                }
            }
        }
    });

    if (chartVarName === 'debtChart') debtChart = newChart;
    if (chartVarName === 'originalDebtChart') originalDebtChart = newChart;
}

function plotRetirementForecast(retirement) {
    if (retirementChart) retirementChart.destroy();

    let {
        "Current Savings ($)": savings,
        "Annual Income 1 ($)": income1,
        "Annual Income 2 ($)": income2,
        "Years Until Jenn Retires (#)": jennsYear,
        "Annual Contribution (%)": contrib,
        "Employer Match (%)": match,
        "Annual Return (%)": returnRate,
        "Current Age": currentAge,
        "Age to Forecast To": forecastToAge,
        "Retirement Ages": ages,
        "Withdrawal Rate (%)": withdrawal
    } = retirement;

    const forecastYears = forecastToAge - currentAge;
    const labels = [];
    let datePointer = new Date();
    for (let i = 0; i < forecastYears; i++) {
        labels.push(formatMonthYear(datePointer));
        datePointer.setFullYear(datePointer.getFullYear() + 1);
    }

    const data = [];
    let balance = savings;
    let income = income1 + income2;
    for (let year = 0; year < forecastYears; year++) {
        if (year === jennsYear) income = income1;
        balance += balance * (returnRate / 100) + (contrib / 100) * income + (match / 100) * income;
        data.push(balance);
    }

    const datasets = [
        {
            label: 'Retirement Savings',
            data,
            fill: false,
            borderColor: 'blue'
        }
    ];

    ages.forEach(age => {
        const retirementIndex = age - currentAge;
        if (retirementIndex <= 0 || retirementIndex >= forecastYears) return;
        const savingsAtRetirement = data[retirementIndex - 1];
        const remainingYears = forecastToAge - age ;
        const yearlyWithdrawal = savingsAtRetirement / remainingYears;

        const withdrawData = [...data];
        for (let i = retirementIndex; i < forecastYears; i++) {
            withdrawData[i] = withdrawData[i - 1] - yearlyWithdrawal;
        }

        datasets.push({
            label: `Withdraw at Age ${age} ($${(yearlyWithdrawal / 12).toFixed(0)}/mon ${(yearlyWithdrawal/(income1+income2)*100).toFixed(0)}%)`,
            data: withdrawData,
            borderColor: getRandomColor(),
            borderDash: [5, 5]
        });
    });

    const ctx = document.getElementById('retirementChart');
    retirementChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: { position: 'top' },
                title: {
                    display: true,
                    text: 'Retirement Forecast'
                }
            },
            elements: {
                point: { radius: 0 }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Balance ($)'
                    }
                }
            }
        }
    });
}
