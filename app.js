// app.js

// Keep global references to chart instances (so we can destroy them before recreating)
let debtChart = null;
let retirementChart = null;

function runCalculations() {
    const debts = [];
    document.querySelectorAll('#debtTable tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td input');
        debts.push({
            debt: cells[0].value,
            balance: parseFloat(cells[1].value),
            rate: parseFloat(cells[2].value) / 100,
            payment: parseFloat(cells[3].value)
        });
    });

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

    // Plot or re-plot charts
    plotDebtBurndown(debts);
    plotRetirementForecast(retirement);
}

/**
 * Utility function to format a JavaScript Date as "MMM-yyyy"
 *   e.g., "Jan-2025", "Feb-2025"
 */
function formatMonthYear(date) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${month}-${year}`;
}

function plotDebtBurndown(debts) {
    // Destroy existing chart if it exists
    if (debtChart) {
        debtChart.destroy();
    }

    // Sort debts by rate in descending order
    debts.sort((a, b) => b.rate - a.rate);

    const maxIterations = 360; // up to 360 months (30 years) of debt payoff
    // Prepare a date label array of length maxIterations
    const labels = [];
    let datePointer = new Date(); // "today"
    for (let i = 0; i < maxIterations; i++) {
        labels.push(formatMonthYear(datePointer));
        // Move one month ahead
        datePointer.setMonth(datePointer.getMonth() + 1);
    }

    // Track each debt's balance history
    const debtHistory = debts.map(debt => ({ ...debt, history: [] }));

    let finalIndex = maxIterations; // So we can trim labels later if we pay off early
    for (let i = 0; i < maxIterations; i++) {
        let snowballPayment = 0;
        // Gather extra payment from any fully-paid debts
        debtHistory.forEach(d => {
            if (d.balance <= 0) snowballPayment += d.payment;
        });

        // Apply payments in descending order of interest
        for (let d of debtHistory) {
            if (d.balance <= 0) continue; // skip debts that are already 0
            const interest = (d.balance * d.rate) / 12;
            const principalPayment = d.payment + snowballPayment - interest;
            // Once we apply the snowball to the first unpaid debt, reset for next
            snowballPayment = 0;

            if (principalPayment >= d.balance) {
                d.history.push(0);
                d.balance = 0;
            } else {
                d.balance -= principalPayment;
                d.history.push(d.balance);
            }
        }

        // If all debts are paid, record where we ended
        if (debtHistory.every(d => d.balance <= 0)) {
            finalIndex = i + 1; // zero-based i means we used i+1 data points
            break;
        }
    }

    // If paid off early, trim the unused labels
    labels.length = finalIndex;

    // Build datasets
    const datasets = debtHistory.map(d => ({
        label: d.debt,
        data: d.history.slice(0, finalIndex),
        fill: false,
        borderColor: getRandomColor()
    }));

    // Create new chart
    const ctx = document.getElementById('debtChart');
    debtChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' }
            },
            elements: {
                point: {
                    radius: 0 // Hides the dots
                }
            }
            // Optionally tweak the x-axis appearance, e.g. rotate labels if needed:
            // scales: {
            //   x: {
            //     ticks: {
            //       maxRotation: 90,
            //       minRotation: 45
            //     }
            //   }
            // }
        }
    });
}

function plotRetirementForecast(retirement) {
    // Destroy existing chart if it exists
    if (retirementChart) {
        retirementChart.destroy();
    }

    // Extract retirement values
    let {
        "Current Savings ($)": savings,
        "Annual Income 1 ($)": income1,
        "Annual Income 2 ($)": income2,
        "Years Until Jenn Retires (#)": jennsYear,
        "Annual Contribution (%)": contrib,
        "Employer Match (%)": match,
        "Annual Return (%)": returnRate,
        "Years to Forecast": years,
        "Retirement Ages": ages,
        "Withdrawal Rate (%)": withdrawal
    } = retirement;

    // Based on original logic, we used 41 points (Age 50 to Age 90).
    const labelCount = 91 - 50;  // 41 total "years"

    // Prepare yearly date-based labels, each label is 1 year apart, starting from "today"
    const labels = [];
    let datePointer = new Date();
    for (let i = 0; i < labelCount; i++) {
        labels.push(formatMonthYear(datePointer));
        datePointer.setFullYear(datePointer.getFullYear() + 1);
    }

    // Main "Retirement Savings" dataset is the first `years` data points
    const data = [];
    let balance = savings;
    let income = income1 + income2;
    for (let year = 0; year < years; year++) {
        // Example spouse retirement logic:
        if (year === jennsYear) {
            income = income1;
        }
        // Annual growth + contributions
        balance += balance * (returnRate / 100)
                 + (contrib / 100) * income
                 + (match / 100) * income;
        data.push(balance);
    }

    // The main dataset might have fewer points than labelCount if years < 41.
    const datasets = [
        {
            label: 'Retirement Savings',
            data,
            fill: false,
            borderColor: 'blue'
        }
    ];

    // For each retirement age, generate a dashed withdrawal line
    ages.forEach(age => {
        // We'll create a separate data array for the entire 41-year window
        // that includes accumulation for the first `data.length` years,
        // then continues with withdrawals up to labelCount.
        const withdrawData = Array.from({ length: labelCount }, (_, i) =>
            i < data.length ? data[i] : 0
        );

        // Age 50 corresponds to index 0 in this 41-year array
        // Age X corresponds to index (X - 50).
        // Original code used (X - 50 - 1), but let's ensure we line up exactly
        // with "year boundary" if that was your intention.
        // Adjust as needed to match your exact logic.
        const retirementIndex = age - 50;
        if (retirementIndex <= 0 || retirementIndex >= withdrawData.length) {
            // If age is out of chart range, skip
            return;
        }

        const savingsAtRetirement = withdrawData[retirementIndex - 1];
        const remainingYears = 90 - age + 1; // inclusive
        const yearlyWithdrawal = savingsAtRetirement / remainingYears;

        // Subtract that yearly withdrawal from each subsequent year
        for (let i = retirementIndex; i < withdrawData.length; i++) {
            withdrawData[i] = withdrawData[i - 1] - yearlyWithdrawal;
        }

        datasets.push({
            label: `Withdraw at Age ${age} ($${(yearlyWithdrawal / 12).toFixed(0)}/mon ${(yearlyWithdrawal/(income1+income2)*100).toFixed(0)}%)`,
            data: withdrawData,
            borderColor: getRandomColor(),
            borderDash: [5, 5]
        });
    });

    // Build the new chart
    const ctx = document.getElementById('retirementChart');
    retirementChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' }
            },
            elements: {
                point: {
                    radius: 0 // Hides the dots
                }
            }
        }
    });
}

// A fixed palette of 7 colors
const colorPalette = [
    '#FF6633', // orange-ish
    '#006400', // dark green
    '#FF33FF', // magenta
    '#FFD700', // gold (bright yellow)
    '#00B3E6', // teal
    '#A020F0', // purple
    '#3366E6'  // blue
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