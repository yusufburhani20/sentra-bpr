export const state = {
    usersDB: [],
    costCodesDB: [],
    transactionsDB: [],
    auditDB: [],
    notifDB: [],
    refCountersDB: [],
    pendingApprovalsDB: [], // governance workflow pending items
    slipSubmissionsDB: [],

    currentUser: null,
    currentRole: "",
    activeView: "dashboard", // landing default view updated
    activeNextRef: "",

    currentTxPage: 1,
    totalTxPages: 1,
    totalTxCount: 0,

    currentAuditPage: 1,
    totalAuditPages: 1,
    totalAuditCount: 0,

    currentCcPage: 1,
    totalCcPages: 1,
    totalCcCount: 0,
    ccLimit: 50,

    paginationLimit: 50
};
