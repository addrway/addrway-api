const puppeteer = require("puppeteer");
const path = require("path");

function buildInvoiceHTML(data) {
  return `
  <html>
  <head>
    <style>
      body {
        font-family: Arial;
        padding: 40px;
        color: #111827;
      }

      .logo {
        font-size: 32px;
        font-weight: 800;
        color: #2563eb;
      }

      .section {
        margin-top: 20px;
      }

      .title {
        background: #f1f5f9;
        padding: 8px;
        font-weight: bold;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }

      th, td {
        border-bottom: 1px solid #e5e7eb;
        padding: 10px;
        text-align: left;
      }

      .total {
        font-size: 22px;
        font-weight: bold;
      }
    </style>
  </head>

  <body>

    <div class="logo">Addrway</div>

    <div class="section">
      <div class="title">Customer Account Information</div>
      <p><b>Account ID:</b> ${data.accountId}</p>
    </div>

    <div class="section">
      <div class="title">Order Information</div>

      <p><b>Order ID:</b> ${data.orderId}</p>
      <p><b>Plan:</b> ${data.planName}</p>

      <table>
        <thead>
          <tr>
            <th>Plan ID</th>
            <th>Plan Name</th>
            <th>Unit Cost</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>${data.planId}</td>
            <td>${data.planName}</td>
            <td>$${data.unitCost}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:20px">
        <p>Subtotal: $${data.subtotal}</p>
        <p>Tax: $${data.tax}</p>
        <p class="total">Total: $${data.total}</p>
      </div>
    </div>

  </body>
  </html>
  `;
}

async function generateInvoice(data) {

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  const html = buildInvoiceHTML(data);

  await page.setContent(html);

  const fileName = `invoice-${data.orderId}.pdf`;

  const filePath = path.join(__dirname, "invoices", fileName);

  await page.pdf({
    path: filePath,
    format: "A4",
    printBackground: true
  });

  await browser.close();

  return fileName;
}

module.exports = generateInvoice;
