window.WILLS_DEMO = {
  OWNER: {
    user:{displayName:'Owner Wills',role:'OWNER',scopeType:'NETWORK',outletCodes:['RB','TM','UPI','CPK','CPS']},
    health:[
      {'Outlet Code':'RB','Outlet Name':'Pasar Rebo','Health Score':'72.60','Health Status':'PERLU PERHATIAN','Revenue':'653000','Key Driver':'Sales di bawah baseline + inventory variance','Confidence':'MEDIUM-HIGH'},
      {'Outlet Code':'TM','Outlet Name':'Tegal Munjul','Health Score':'72.83','Health Status':'PERLU PERHATIAN','Revenue':'1146000','Key Driver':'65.45% revenue berasal dari bulk/B2B','Confidence':'MEDIUM'},
      {'Outlet Code':'UPI','Outlet Name':'UPI','Health Score':'54.72','Health Status':'PRIORITAS','Revenue':'262000','Key Driver':'Transaction count turun + inventory variance tinggi','Confidence':'HIGH'},
      {'Outlet Code':'CPK','Outlet Name':'Cikopak','Health Score':'74.05','Health Status':'PERLU PERHATIAN','Revenue':'367000','Key Driver':'Sales sehat tetapi shift belum closing','Confidence':'HIGH'},
      {'Outlet Code':'CPS','Outlet Name':'Cipaisan','Health Score':'91.65','Health Status':'SEHAT','Revenue':'310000','Key Driver':'Sales relatif stabil; inventory paling bersih','Confidence':'MEDIUM-HIGH'}
    ],
    morningBrief:[
      {key:'Network Headline Revenue 31/08',value:'2738000',interpretation:'Includes Rp750.000 TM bulk/B2B'},
      {key:'Network Organic Revenue 31/08',value:'1988000',interpretation:'Headline minus identified bulk/B2B'},
      {key:'Priority Health',value:'UPI — 54.72',interpretation:'PRIORITAS — below 60'},
      {key:'Supply Review',value:'TM + CPK',interpretation:'Link integrity review sebelum menyimpulkan belum diterima'},
      {key:'Closing Alert',value:'Cikopak 31/08',interpretation:'Shift masih OPEN pada snapshot'}
    ],
    alerts:[
      {Severity:'HIGH',Category:'SALES','Outlet/Scope':'UPI',Signal:'Transaction volume turun tajam','Recommended Action':'Investigasi traffic dan inventory integrity'},
      {Severity:'HIGH',Category:'PEOPLE_OPERATION','Outlet/Scope':'CPK',Signal:'Shift 31/08 masih OPEN','Recommended Action':'Selesaikan closing resmi'},
      {Severity:'MEDIUM',Category:'SUPPLY_CHAIN','Outlet/Scope':'TM + CPK',Signal:'Nomor SJ perlu link integrity review','Recommended Action':'Cocokkan request, SJ, dan penerimaan'}
    ],
    menu:['home','outlets','alerts','will','warehouse','finance','operations','reports','profile']
  },
  INVESTOR: {
    user:{displayName:'Investor Cikopak',role:'INVESTOR',scopeType:'OUTLET',outletCodes:['CPK']},
    health:[{'Outlet Code':'CPK','Outlet Name':'Cikopak','Health Score':'74.05','Health Status':'PERLU PERHATIAN','Revenue':'367000','Key Driver':'Performa penjualan relatif sehat','Confidence':'HIGH'}],
    morningBrief:[
      {key:'Outlet Health',value:'74.05',interpretation:'PERLU PERHATIAN'},
      {key:'Revenue Last Complete Day',value:'367000',interpretation:'Completed day'},
      {key:'Key Driver',value:'Performa penjualan relatif sehat',interpretation:'Assigned outlet only'}
    ],
    alerts:[{Severity:'MEDIUM',Category:'SALES','Outlet/Scope':'CPK',Signal:'Pantau tren transaksi 7 hari','Recommended Action':'Lihat performa produk & traffic'}],
    menu:['home','outlet','will','reports','profile']
  }
};
