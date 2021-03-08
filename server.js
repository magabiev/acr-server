const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
dayjs.extend(relativeTime);

const jsonServer = require("json-server");
const server = jsonServer.create();

const path = require("path");
const router = jsonServer.router(path.join(__dirname, "db.json"));

const filterArrays = (filterArr, clientId) => {
  return filterArr.filter((item) => {
    return item.clientId.toString() === clientId.toString();
  });
};

const payments = router.db.get("payments");
const purchases = router.db.get("purchases");
const clients = router.db.get("clients");
const admins = router.db.get("admins");
const clientsPurchases = [...new Set(purchases.map((item) => item.clientId))];

const paymentsBalances = clientsPurchases.map((debtorId) => {
  /** Суммирование всех покупок текущего клиента **/
  const purchasesFiltered = filterArrays(purchases, debtorId);
  const purchasesTotalAmount = purchasesFiltered.reduce((total, purchase) => {
    return total + purchase.price;
  }, 0);
  /** Фильтрация платежей по текущему клиенту **/
  const paymentsFiltered = () => {
    let items = [];
    for (let purchase of purchasesFiltered) {
      const payment = payments.filter(
        (item) => item.purchaseId === purchase.id
      );
      items = [...items, ...payment];
    }
    return items;
  };
  /** Суммирование всех платежей текущего клиента **/
  const paymentsTotalAmount = paymentsFiltered().reduce((total, payment) => {
    return total + payment.amount;
  }, 0);
  return {
    clientId: debtorId,
    paymentBalances: purchasesTotalAmount - paymentsTotalAmount,
  };
});

server.get("/paymentsBalances", (req, res) => {
  return res.json(paymentsBalances);
});

/** Last Payment Balance Owed Filter **/
server.get("/paymentsBalances/from=:from/to=:to", (req, res) => {
  const paymentsBalanceFilter = paymentsBalances.filter((item) => {
    return Number(req.params.from) && Number(req.params.to)
      ? item.paymentBalances >= Number(req.params.from) &&
          Number(req.params.to) >= item.paymentBalances
      : Number(req.params.from)
      ? item.paymentBalances >= Number(req.params.from)
      : Number(req.params.to)
      ? item.paymentBalances <= Number(req.params.to)
      : item.paymentBalances;
  });

  const clientsFiltered = () => {
    return paymentsBalanceFilter.map((item) => {
      return clients.find((client) => client.id === item.clientId);
    });
  };

  return res.json(clientsFiltered());
});

/** unpaid debt Filter **/
server.get("/unpaidDebt", (req, res) => {
  const paymentsBalanceFilter = paymentsBalances.filter(
    (item) => item.paymentBalances > 0
  );
  const clientsFiltered = () => {
    return paymentsBalanceFilter.map((item) => {
      return clients.find((client) => client.id === item.clientId);
    });
  };
  return res.json(clientsFiltered());
});

/** Last Payment Date Diffs **/
const paymentsDates = clientsPurchases.map((debtor) => {
  /** Фильтрация покупок каждого клиента **/
  const purchasesFiltered = filterArrays(purchases, debtor);
  /** Фильтрация платежей относительно покупок **/
  const paymentsFiltered = () => {
    let items = [];
    for (let purchase of purchasesFiltered) {
      const payment = payments.filter(
        (item) => item.purchaseId === purchase.id
      );
      items = [...items, ...payment];
    }
    return items;
  };
  /** Разницы в датах от текущей даты **/
  const paymentsDatesDiff = paymentsFiltered().map((item) => {
    const dates = dayjs().diff(item.date, "day");
    return {
      purchaseId: item.purchaseId,
      dateDiff: dates,
    };
  });
  const minDatesDiff = Math.min(
    ...paymentsDatesDiff.map((item) => item.dateDiff)
  );
  return paymentsDatesDiff.find((item) => item.dateDiff === minDatesDiff);
});

/**Last Payment Week Ago & Month Ago filters **/
server.get("/lastPayment/weekAgo", (req, res) => {
  /** Фильтрация покупок относительно последних платежей клиентов  **/
  const filterPaymentsWeekAgo = paymentsDates.filter(
    (item) => item.dateDiff > 7
  );
  const lastPaymentPurchases = filterPaymentsWeekAgo.map((payment) => {
    return purchases.find((item) => item.id === payment.purchaseId);
  });
  const lastPaymentClients = lastPaymentPurchases.map((purchase) => {
    return clients.find((client) => client.id === purchase.toJSON().clientId);
  });
  return res.json(lastPaymentClients);
});
server.get("/lastPayment/monthAgo", (req, res) => {
  /** Фильтрация покупок относительно последних платежей клиентов  **/
  const filterPaymentsWeekAgo = paymentsDates.filter(
    (item) => item.dateDiff > 31
  );
  const lastPaymentPurchases = filterPaymentsWeekAgo.map((payment) => {
    return purchases.find((item) => item.id === payment.purchaseId);
  });
  const lastPaymentClients = lastPaymentPurchases.map((purchase) => {
    return clients.find((client) => client.id === purchase.toJSON().clientId);
  });
  return res.json(lastPaymentClients);
});
/** Authorization **/
server.get("/authorization/login=:login/password=:password", (req, res) => {
  const admin = admins.find((item) => item.login === req.params.login);
  const password = admin.toJSON().password;
  return password === req.params.password
    ? res.json(admin.toJSON().token)
    : res.json();
});
/** Admin Data **/
server.get("/adminInfo/token=:token", (req, res) => {
  const admin = admins.find((item) => item.token === req.params.token);
  const token = admin.toJSON().token;
  return token === req.params.token ? res.json(admin) : res.json();
});
server.use(router);

server.listen(process.env.PORT || 3005, function () {
  console.log("JSON Server is running");
});
