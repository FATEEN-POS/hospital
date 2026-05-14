// ============================================================
// DATABASE ENGINE - نظام قاعدة البيانات
// ============================================================

/**
 * متغيرات عامة
 * db        : كائن قاعدة بيانات SQLite يعيش في ذاكرة المتصفح
 * SQL       : مكتبة sql.js المحمّلة من CDN
 * DB_KEY    : مفتاح الحفظ في localStorage (نسخة احتياطية سريعة)
 * currentUser: بيانات المستخدم الذي سجّل دخوله حالياً
 */
let db = null;
let currentUser = null;
let SQL = null;
const DB_KEY = 'hospital_nile_db_v1';

/**
 * initDB() — يُشغَّل مرة واحدة عند تحميل الصفحة.
 * يحاول تحميل قاعدة بيانات محفوظة من localStorage.
 * إذا لم توجد، ينشئ قاعدة جديدة ويملؤها ببيانات تجريبية.
 */
async function initDB() {
  try {
    // تحميل WASM مع كاش ذكي: لو محفوظ محلياً استخدمه، لو لأ حمّله من CDN
    await (window.__loadSqlJs ? window.__loadSqlJs() : Promise.resolve());

    SQL = await initSqlJs({
      locateFile: f => {
        // لو عندنا نسخة محفوظة محلياً استخدمها أوفلاين
        if (f.endsWith('.wasm') && window.__sqlJsWasmUrl) {
          return window.__sqlJsWasmUrl;
        }
        // fallback: CDN (لو في نت)
        return `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`;
      }
    });
    const saved = localStorage.getItem(DB_KEY);
    if (saved) {
      // تحميل قاعدة بيانات محفوظة مسبقاً
      const arr = new Uint8Array(JSON.parse(saved));
      db = new SQL.Database(arr);
    } else {
      // إنشاء قاعدة بيانات جديدة فارغة
      db = new SQL.Database();
      createTables();
      seedData();
    }
    return true;
  } catch(e) {
    console.error('خطأ في تهيئة قاعدة البيانات:', e);
    return false;
  }
}

// ============================================================
// SAVE / EXPORT / IMPORT — حفظ وتصدير واستيراد
// ============================================================

/**
 * saveDB() — يحفظ قاعدة البيانات في localStorage تلقائياً.
 * يُستدعى بعد كل عملية تعديل (INSERT / UPDATE / DELETE).
 * يُظهر مؤشر "جاري الحفظ..." لمدة ثانية ثم يعود لـ "محفوظ".
 */
function saveDB() {
  if (!db) return;

  // تحديث مؤشر الحالة في الـ toolbar
  const dot = document.getElementById('save-dot');
  const status = document.getElementById('save-status');
  if (dot && status) {
    dot.classList.add('saving');
    status.textContent = 'جاري الحفظ...';
  }

  // تصدير قاعدة البيانات كـ Uint8Array وحفظها في localStorage
  const data = db.export();
  localStorage.setItem(DB_KEY, JSON.stringify(Array.from(data)));

  // إعادة مؤشر الحالة بعد ثانية
  setTimeout(() => {
    if (dot && status) {
      dot.classList.remove('saving');
      status.textContent = 'تم الحفظ التلقائي ✅';
    }
  }, 800);
}

/**
 * exportDB() — يُصدّر قاعدة البيانات كملف .db حقيقي على جهاز المستخدم.
 * الملف هو SQLite بايت-كود يمكن فتحه بـ DB Browser for SQLite أو أي أداة SQLite.
 * الاسم يتضمن تاريخ ووقت التصدير.
 */
function exportDB() {
  if (!db) { toast('قاعدة البيانات غير محملة', 'error'); return; }

  // تصدير قاعدة البيانات كـ Uint8Array
  const data = db.export();
  const blob = new Blob([data], { type: 'application/octet-stream' });

  // إنشاء رابط تحميل مؤقت
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  a.href = url;
  a.download = `hospital_nile_${dateStr}.db`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast('✅ تم تصدير قاعدة البيانات بنجاح');
}

/**
 * importDB(event) — يستورد ملف .db من جهاز المستخدم.
 * يقرأ الملف كـ ArrayBuffer ويُحمّله كقاعدة بيانات SQLite جديدة.
 * يحل محل القاعدة الحالية في الذاكرة وفي localStorage.
 */
function importDB(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm(`هل تريد استيراد الملف "${file.name}"؟\n⚠️ سيتم استبدال قاعدة البيانات الحالية بالكامل.`)) {
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // تحميل الملف كقاعدة بيانات SQLite
      const arr = new Uint8Array(e.target.result);
      db = new SQL.Database(arr);

      // حفظ القاعدة الجديدة في localStorage
      const data = db.export();
      localStorage.setItem(DB_KEY, JSON.stringify(Array.from(data)));

      toast('✅ تم استيراد قاعدة البيانات بنجاح! جاري إعادة التحميل...');
      setTimeout(() => {
        showPage('dashboard');
        loadDashboard();
        updateBadges();
      }, 800);
    } catch(err) {
      toast('❌ خطأ في قراءة الملف. تأكد أنه ملف SQLite صحيح.', 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);

  // إعادة ضبط input حتى يمكن رفع نفس الملف مرة أخرى
  event.target.value = '';
}

/**
 * resetDB() — يمسح كل البيانات ويبدأ من الصفر بالبيانات التجريبية.
 * تحذير: لا يمكن التراجع عن هذه العملية.
 */
function resetDB() {
  if (!confirm('⚠️ تحذير!\n\nسيتم مسح جميع البيانات نهائياً وإعادة البيانات التجريبية.\n\nهل أنت متأكد؟')) return;
  if (!confirm('تأكيد ثانٍ: هل تريد فعلاً مسح كل شيء؟')) return;

  localStorage.removeItem(DB_KEY);
  db = new SQL.Database();
  createTables();
  seedData();

  toast('✅ تم إعادة ضبط قاعدة البيانات');
  showPage('dashboard');
  loadDashboard();
  updateBadges();
}

// ============================================================
// SQL HELPERS — دوال مساعدة للتعامل مع SQL
// ============================================================

/**
 * run(sql, params) — ينفّذ استعلام تعديل (INSERT/UPDATE/DELETE)
 * ثم يحفظ التغييرات تلقائياً في localStorage.
 */
function run(sql, params=[]) {
  db.run(sql, params);
  saveDB(); // حفظ تلقائي بعد كل تعديل
}

/**
 * query(sql, params) — ينفّذ استعلام قراءة (SELECT)
 * ويعيد مصفوفة من الكائنات حيث كل كائن يمثل صفاً.
 */
function query(sql, params=[]) {
  const res = db.exec(sql, params);
  if (!res.length) return [];
  return res[0].values.map(row => {
    const obj = {};
    res[0].columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

/**
 * queryOne(sql, params) — مثل query() لكن يعيد صفاً واحداً أو null.
 */
function queryOne(sql, params=[]) {
  const res = query(sql, params);
  return res.length ? res[0] : null;
}

// ============================================================
// TABLE CREATION — إنشاء جداول قاعدة البيانات
// ============================================================

/**
 * createTables() — ينشئ الجداول الأربعة الأساسية.
 * IF NOT EXISTS يضمن عدم مسح البيانات إذا كانت الجداول موجودة.
 */
function createTables() {
  // جدول المستخدمين (موظفي المستشفى)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'staff',      -- admin | doctor | staff | nurse
    phone TEXT,
    department TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1        -- 1 = نشط, 0 = موقوف
  )`);

  // جدول المرضى
  db.run(`CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dob TEXT,                       -- تاريخ الميلاد
    gender TEXT,                    -- ذكر | أنثى
    blood_type TEXT,                -- فصيلة الدم
    phone TEXT,
    email TEXT,
    address TEXT,
    conditions TEXT,                -- أمراض مزمنة أو ملاحظات طبية
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // جدول الأطباء
  db.run(`CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    specialization TEXT,            -- التخصص
    phone TEXT,
    experience INTEGER DEFAULT 0,   -- سنوات الخبرة
    fee INTEGER DEFAULT 0,          -- رسوم الكشف بالجنيه
    status TEXT DEFAULT 'متاح',     -- متاح | مشغول | إجازة
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // جدول الحجوزات
  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    doctor_id INTEGER,
    date TEXT,
    time TEXT,
    type TEXT DEFAULT 'كشف عادي',   -- كشف عادي | متابعة | استشارة | طوارئ
    status TEXT DEFAULT 'مجدول',    -- مجدول | مؤكد | مكتمل | ملغي
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(id),
    FOREIGN KEY(doctor_id) REFERENCES doctors(id)
  )`);

  saveDB();
}

// ============================================================
// SEED DATA — بيانات تجريبية أولية
// ============================================================

/**
 * seedData() — يملأ قاعدة البيانات ببيانات تجريبية عند الإنشاء الأول.
 */
function seedData() {
  // مستخدمون: [الاسم, اسم المستخدم, كلمة المرور, الدور, الهاتف, القسم]
  const users = [
    ['مدير النظام','admin','admin123','admin','01000000001','الإدارة'],
    ['د. أحمد محمود','dr.ahmed','doc123','doctor','01111111111','القلب'],
    ['سارة موظفة الاستقبال','staff1','staff123','staff','01222222222','الاستقبال'],
    ['ممرض محمد علي','nurse1','nurse123','nurse','01333333333','الطوارئ'],
  ];
  users.forEach(u => db.run(
    `INSERT INTO users(name,username,password,role,phone,department) VALUES(?,?,?,?,?,?)`, u
  ));

  // أطباء: [الاسم, التخصص, الهاتف, الخبرة, الرسوم, الحالة]
  const docs = [
    ['د. أحمد محمود','قلب وأوعية','01111111111',15,500,'متاح'],
    ['د. فاطمة حسن','نساء وتوليد','01112222222',10,400,'متاح'],
    ['د. كريم عادل','أطفال','01113333333',8,350,'متاح'],
    ['د. منى السيد','باطنة','01114444444',12,300,'متاح'],
    ['د. سامي خالد','عظام','01115555555',20,600,'مشغول'],
    ['د. رانيا إبراهيم','مخ وأعصاب','01116666666',7,450,'متاح'],
  ];
  docs.forEach(d => db.run(
    `INSERT INTO doctors(name,specialization,phone,experience,fee,status) VALUES(?,?,?,?,?,?)`, d
  ));

  // مرضى
  const pts = [
    ['محمد أحمد علي','1985-03-15','ذكر','O+','01000111111','m.ahmed@mail.com','القاهرة','مرض السكر'],
    ['نورا محمود سعيد','1990-07-22','أنثى','A+','01000222222','nora@mail.com','الجيزة','ضغط الدم'],
    ['خالد عبدالله حسن','1978-11-30','ذكر','B+','01000333333','khaled@mail.com','الإسكندرية',''],
    ['سمر يوسف أمين','2000-05-10','أنثى','AB-','01000444444','samar@mail.com','المنصورة','حساسية البنسلين'],
    ['عمر سيد أحمد','1965-09-05','ذكر','A-','01000555555','omar@mail.com','أسيوط','قصور القلب'],
    ['ريم حسن محمد','1995-12-18','أنثى','O-','01000666666','reem@mail.com','طنطا',''],
    ['تامر علي إبراهيم','1988-04-25','ذكر','B-','01000777777','tamer@mail.com','القاهرة','ربو'],
    ['هند سامي كريم','1975-08-14','أنثى','O+','01000888888','hind@mail.com','الجيزة','مرض السكر، ضغط الدم'],
  ];
  pts.forEach(p => db.run(
    `INSERT INTO patients(name,dob,gender,blood_type,phone,email,address,conditions) VALUES(?,?,?,?,?,?,?,?)`, p
  ));

  // حجوزات (اليوم + أمس + غد)
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
  const tomorrow  = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const appts = [
    [1,1,today,'09:00','كشف عادي','مؤكد','مراجعة القلب'],
    [2,2,today,'10:00','متابعة','مجدول','متابعة الحمل'],
    [3,3,today,'11:00','كشف عادي','مؤكد','حمى ونزلة برد'],
    [4,4,today,'14:00','استشارة','مجدول','آلام في البطن'],
    [5,1,yesterday,'09:30','كشف عادي','مكتمل','فحص دوري'],
    [6,5,yesterday,'10:30','متابعة','مكتمل','متابعة ضغط الدم'],
    [7,2,yesterday,'11:00','كشف عادي','ملغي',''],
    [8,3,tomorrow,'09:00','كشف عادي','مجدول',''],
    [1,4,tomorrow,'15:00','متابعة','مجدول','متابعة السكر'],
    [3,6,today,'15:30','كشف عادي','مجدول','صداع مزمن'],
  ];
  appts.forEach(a => db.run(
    `INSERT INTO appointments(patient_id,doctor_id,date,time,type,status,notes) VALUES(?,?,?,?,?,?,?)`, a
  ));

  saveDB();
}

// ============================================================
// AUTH — تسجيل الدخول والخروج
// ============================================================

function doLogin() {
  const u = document.getElementById('login-username').value.trim();
  const p = document.getElementById('login-password').value.trim();
  const user = queryOne(
    `SELECT * FROM users WHERE username=? AND password=? AND active=1`, [u, p]
  );
  if (!user) {
    showAlert('login-error', 'اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
    return;
  }
  currentUser = user;
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('app').classList.add('active');
  initApp();
}

function doLogout() {
  currentUser = null;
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-page').classList.add('active');
}

// ============================================================
// APP INIT — تهيئة التطبيق بعد تسجيل الدخول
// ============================================================

function initApp() {
  // بيانات المستخدم في الـ sidebar
  document.getElementById('sb-username').textContent = currentUser.name;
  const roleLabels = {
    admin: 'مدير النظام', doctor: 'طبيب',
    staff: 'موظف استقبال', nurse: 'ممرض/ممرضة'
  };
  document.getElementById('sb-role').textContent = roleLabels[currentUser.role] || currentUser.role;
  document.getElementById('sb-avatar').textContent = currentUser.name.charAt(0);

  // إخفاء عناصر admin فقط للمدير
  document.querySelectorAll('.admin-only').forEach(el =>
    el.style.display = currentUser.role === 'admin' ? '' : 'none'
  );
  document.querySelectorAll('.admin-btn').forEach(el =>
    el.style.display = currentUser.role === 'admin' ? '' : 'none'
  );

  // التاريخ الحالي
  document.getElementById('current-date').textContent =
    new Date().toLocaleDateString('ar-EG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  showPage('dashboard');
  updateBadges();
}

// ============================================================
// NAVIGATION — التنقل بين الصفحات
// ============================================================

const pageTitles = {
  dashboard: 'لوحة التحكم',
  appointments: 'إدارة الحجوزات',
  patients: 'المرضى',
  doctors: 'الكادر الطبي',
  accounts: 'حسابات الموظفين',
  reports: 'التقارير'
};

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.includes(pageTitles[page]?.substring(0, 4)))
      n.classList.add('active');
  });
  document.getElementById('page-title').textContent = pageTitles[page] || '';

  const loaders = {
    dashboard: loadDashboard,
    appointments: loadAppointments,
    patients: loadPatients,
    doctors: loadDoctors,
    accounts: loadAccounts,
    reports: loadReports
  };
  loaders[page]?.();
}

// ============================================================
// DASHBOARD — لوحة التحكم
// ============================================================

function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const totalPatients  = queryOne(`SELECT COUNT(*) as c FROM patients`).c;
  const totalDoctors   = queryOne(`SELECT COUNT(*) as c FROM doctors`).c;
  const todayAppts     = queryOne(`SELECT COUNT(*) as c FROM appointments WHERE date=?`, [today]).c;
  const pendingAppts   = queryOne(`SELECT COUNT(*) as c FROM appointments WHERE status IN ('مجدول','مؤكد')`).c;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card accent">
      <div class="stat-icon">👥</div>
      <div class="stat-value">${totalPatients}</div>
      <div class="stat-label">إجمالي المرضى</div>
    </div>
    <div class="stat-card info">
      <div class="stat-icon">👨‍⚕️</div>
      <div class="stat-value">${totalDoctors}</div>
      <div class="stat-label">الأطباء</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-icon">📅</div>
      <div class="stat-value">${todayAppts}</div>
      <div class="stat-label">مواعيد اليوم</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-icon">⏳</div>
      <div class="stat-value">${pendingAppts}</div>
      <div class="stat-label">مواعيد معلقة</div>
    </div>
  `;

  // مواعيد اليوم
  const todayList = query(`
    SELECT a.time, p.name as patient, d.name as doctor, d.specialization as dept, a.status
    FROM appointments a
    JOIN patients p ON a.patient_id=p.id
    JOIN doctors d ON a.doctor_id=d.id
    WHERE a.date=? ORDER BY a.time`, [today]);

  const todayEl = document.getElementById('today-appts');
  if (!todayList.length) {
    todayEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><div>لا توجد مواعيد اليوم</div></div>`;
  } else {
    todayEl.innerHTML = todayList.map(a => `
      <div class="appt-item">
        <div class="appt-time">${a.time}</div>
        <div class="appt-info">
          <div class="appt-patient">${a.patient}</div>
          <div class="appt-doctor">${a.doctor}</div>
        </div>
        <span class="appt-dept">${a.dept}</span>
        <span class="badge ${statusBadge(a.status)}">${a.status}</span>
      </div>
    `).join('');
  }

  // مخطط الأسبوع
  const bars = document.getElementById('week-chart');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const ds = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('ar-EG', { weekday: 'short' });
    const count = queryOne(`SELECT COUNT(*) as c FROM appointments WHERE date=?`, [ds]).c;
    days.push({ label, count, ds });
  }
  const max = Math.max(...days.map(d => d.count), 1);
  const colors = ['var(--accent)','var(--info)','var(--warning)','var(--danger)','var(--accent)','var(--info)','var(--warning)'];
  bars.innerHTML = days.map((d, i) => `
    <div class="bar-wrap">
      <div class="bar-val">${d.count}</div>
      <div class="bar" style="height:${Math.max(d.count/max*100,4)}px;background:${colors[i]};opacity:0.8"></div>
      <div class="bar-label">${d.label}</div>
    </div>
  `).join('');

  // الأطباء المتاحون
  const availDocs = query(`SELECT name, specialization FROM doctors WHERE status='متاح' LIMIT 5`);
  document.getElementById('avail-doctors').innerHTML = availDocs.map(d => `
    <div class="appt-item" style="margin-bottom:8px">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(0,200,170,0.3),rgba(79,163,255,0.3));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--accent);flex-shrink:0">${d.name.split(' ')[1]?.charAt(0)||'د'}</div>
      <div class="appt-info"><div class="appt-patient">${d.name}</div><div class="appt-doctor">${d.specialization}</div></div>
      <span class="badge badge-success">متاح</span>
    </div>
  `).join('');

  // نظرة عامة على الأقسام
  const specs = query(`SELECT specialization, COUNT(*) as c FROM doctors GROUP BY specialization ORDER BY c DESC`);
  document.getElementById('dept-overview').innerHTML = specs.map(s => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:14px">${s.specialization}</span>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:80px;height:6px;background:var(--bg-3);border-radius:99px;overflow:hidden">
          <div style="width:${(s.c/totalDoctors*100)}%;height:100%;background:var(--accent);border-radius:99px"></div>
        </div>
        <span style="font-size:13px;font-weight:700;color:var(--accent)">${s.c}</span>
      </div>
    </div>
  `).join('');
}

// ============================================================
// APPOINTMENTS — إدارة الحجوزات
// ============================================================

function loadAppointments(filterStatus='') {
  let sql = `SELECT a.id, p.name as patient, d.name as doctor, d.specialization as dept,
    a.date, a.time, a.type, a.status, a.notes
    FROM appointments a
    JOIN patients p ON a.patient_id=p.id
    JOIN doctors d ON a.doctor_id=d.id`;
  if (filterStatus) sql += ` WHERE a.status='${filterStatus}'`;
  sql += ` ORDER BY a.date DESC, a.time`;
  const rows = query(sql);
  const tbody = document.getElementById('appt-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📭</div><div>لا توجد حجوزات</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="color:var(--text-3)">#${r.id}</td>
      <td><strong>${r.patient}</strong></td>
      <td>${r.doctor}</td>
      <td><span class="badge badge-info">${r.dept}</span></td>
      <td>${formatDate(r.date)}</td>
      <td style="color:var(--accent);font-weight:700">${r.time}</td>
      <td><span class="badge ${statusBadge(r.status)}">${r.status}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="changeApptStatus(${r.id},'مكتمل')" title="مكتمل">✅</button>
          <button class="btn btn-secondary btn-sm btn-icon" onclick="changeApptStatus(${r.id},'ملغي')" title="إلغاء">❌</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteAppointment(${r.id})" title="حذف">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
  updateBadges();
}

function filterApptStatus(val) { loadAppointments(val); }
function searchPatients(val) { loadPatients(val); }

function saveAppointment() {
  const pid    = document.getElementById('a-patient').value;
  const did    = document.getElementById('a-doctor').value;
  const date   = document.getElementById('a-date').value;
  const time   = document.getElementById('a-time').value;
  const type   = document.getElementById('a-type').value;
  const status = document.getElementById('a-status').value;
  const notes  = document.getElementById('a-notes').value;
  if (!pid || !did || !date) { toast('يرجى اختيار المريض والطبيب والتاريخ', 'error'); return; }
  run(`INSERT INTO appointments(patient_id,doctor_id,date,time,type,status,notes) VALUES(?,?,?,?,?,?,?)`,
      [pid, did, date, time, type, status, notes]);
  closeModal('apptModal');
  toast('تم حفظ الحجز بنجاح ✅');
  loadAppointments();
  loadDashboard();
  updateBadges();
}

function changeApptStatus(id, status) {
  run(`UPDATE appointments SET status=? WHERE id=?`, [status, id]);
  loadAppointments();
  toast(`تم تغيير الحالة إلى: ${status}`);
}

function deleteAppointment(id) {
  if (!confirm('هل تريد حذف هذا الحجز؟')) return;
  run(`DELETE FROM appointments WHERE id=?`, [id]);
  loadAppointments();
  toast('تم حذف الحجز', 'error');
}

// ============================================================
// PATIENTS — إدارة المرضى
// ============================================================

function loadPatients(search='') {
  let sql = `SELECT * FROM patients`;
  if (search) sql += ` WHERE name LIKE '%${search}%' OR phone LIKE '%${search}%'`;
  sql += ` ORDER BY id DESC`;
  const rows = query(sql);
  const tbody = document.getElementById('patients-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">👥</div><div>لا يوجد مرضى</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const age = r.dob ? Math.floor((Date.now() - new Date(r.dob)) / (365.25*86400000)) : '—';
    return `<tr>
      <td style="color:var(--text-3)">#${r.id}</td>
      <td><strong>${r.name}</strong></td>
      <td>${age}</td>
      <td><span class="badge ${r.gender==='ذكر'?'badge-info':'badge-warning'}">${r.gender||'—'}</span></td>
      <td style="direction:ltr">${r.phone||'—'}</td>
      <td><span class="badge badge-danger">${r.blood_type||'—'}</span></td>
      <td style="color:var(--text-3);font-size:12px">${r.conditions?.substring(0,30)||'—'}${r.conditions?.length>30?'...':''}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="editPatient(${r.id})">✏️</button>
          <button class="btn btn-secondary btn-sm" onclick="bookForPatient(${r.id})">📅</button>
          <button class="btn btn-danger btn-sm" onclick="deletePatient(${r.id})">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function savePatient() {
  const id         = document.getElementById('p-id').value;
  const name       = document.getElementById('p-name').value.trim();
  const dob        = document.getElementById('p-dob').value;
  const gender     = document.getElementById('p-gender').value;
  const blood      = document.getElementById('p-blood').value;
  const phone      = document.getElementById('p-phone').value;
  const email      = document.getElementById('p-email').value;
  const address    = document.getElementById('p-address').value;
  const conditions = document.getElementById('p-conditions').value;
  if (!name) { toast('يرجى إدخال اسم المريض', 'error'); return; }
  if (id) {
    run(`UPDATE patients SET name=?,dob=?,gender=?,blood_type=?,phone=?,email=?,address=?,conditions=? WHERE id=?`,
        [name, dob, gender, blood, phone, email, address, conditions, id]);
    toast('تم تحديث بيانات المريض ✅');
  } else {
    run(`INSERT INTO patients(name,dob,gender,blood_type,phone,email,address,conditions) VALUES(?,?,?,?,?,?,?,?)`,
        [name, dob, gender, blood, phone, email, address, conditions]);
    toast('تم إضافة المريض بنجاح ✅');
  }
  closeModal('patientModal');
  loadPatients();
}

function editPatient(id) {
  const p = queryOne(`SELECT * FROM patients WHERE id=?`, [id]);
  if (!p) return;
  document.getElementById('patient-modal-title').textContent = '✏️ تعديل بيانات المريض';
  document.getElementById('p-id').value         = p.id;
  document.getElementById('p-name').value       = p.name;
  document.getElementById('p-dob').value        = p.dob||'';
  document.getElementById('p-gender').value     = p.gender||'ذكر';
  document.getElementById('p-blood').value      = p.blood_type||'O+';
  document.getElementById('p-phone').value      = p.phone||'';
  document.getElementById('p-email').value      = p.email||'';
  document.getElementById('p-address').value    = p.address||'';
  document.getElementById('p-conditions').value = p.conditions||'';
  openModal('patientModal');
}

function bookForPatient(pid) {
  populateApptSelects();
  const p = queryOne(`SELECT name FROM patients WHERE id=?`, [pid]);
  document.getElementById('a-patient').value = pid;
  document.getElementById('a-patient-name').value = p ? p.name : '';
  showPage('appointments');
  openModal('apptModal');
}

function deletePatient(id) {
  if (!confirm('هل تريد حذف هذا المريض؟ سيتم حذف جميع حجوزاته أيضاً')) return;
  run(`DELETE FROM appointments WHERE patient_id=?`, [id]);
  run(`DELETE FROM patients WHERE id=?`, [id]);
  loadPatients();
  toast('تم حذف المريض', 'error');
}

// ============================================================
// DOCTORS — إدارة الأطباء
// ============================================================

function loadDoctors() {
  const rows = query(`SELECT d.*,
    (SELECT COUNT(*) FROM appointments WHERE doctor_id=d.id) as total_appts,
    (SELECT COUNT(*) FROM appointments WHERE doctor_id=d.id AND date=date('now')) as today_appts
    FROM doctors d ORDER BY d.id`);
  const grid = document.getElementById('doctors-grid');
  if (!rows.length) {
    grid.innerHTML = `<div class="empty-state"><div>لا يوجد أطباء</div></div>`;
    return;
  }
  const statusColors = { متاح: 'badge-success', مشغول: 'badge-warning', إجازة: 'badge-danger' };
  grid.innerHTML = rows.map(d => `
    <div class="doctor-card">
      <div class="doctor-avatar">${d.name.split(' ')[1]?.charAt(0)||'د'}</div>
      <div class="doctor-name">${d.name}</div>
      <div class="doctor-spec">${d.specialization}</div>
      <div class="doctor-stats">
        <div class="doctor-stat">
          <div class="doctor-stat-val">${d.experience}</div>
          <div class="doctor-stat-lbl">سنة خبرة</div>
        </div>
        <div class="doctor-stat">
          <div class="doctor-stat-val">${d.total_appts}</div>
          <div class="doctor-stat-lbl">مريض</div>
        </div>
        <div class="doctor-stat">
          <div class="doctor-stat-val">${d.fee}</div>
          <div class="doctor-stat-lbl">جنيه</div>
        </div>
      </div>
      <span class="badge ${statusColors[d.status]||'badge-neutral'}">${d.status}</span>
      <div class="divider"></div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn btn-secondary btn-sm" onclick="editDoctor(${d.id})">✏️ تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDoctor(${d.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

function saveDoctor() {
  const id     = document.getElementById('d-id').value;
  const name   = document.getElementById('d-name').value.trim();
  const spec   = document.getElementById('d-spec').value;
  const phone  = document.getElementById('d-phone').value;
  const exp    = document.getElementById('d-exp').value;
  const fee    = document.getElementById('d-fee').value;
  const status = document.getElementById('d-status').value;
  if (!name) { toast('يرجى إدخال اسم الطبيب', 'error'); return; }
  if (id) {
    run(`UPDATE doctors SET name=?,specialization=?,phone=?,experience=?,fee=?,status=? WHERE id=?`,
        [name, spec, phone, exp, fee, status, id]);
    toast('تم تحديث بيانات الطبيب ✅');
  } else {
    run(`INSERT INTO doctors(name,specialization,phone,experience,fee,status) VALUES(?,?,?,?,?,?)`,
        [name, spec, phone, exp, fee, status]);
    toast('تم إضافة الطبيب بنجاح ✅');
  }
  closeModal('doctorModal');
  loadDoctors();
}

function editDoctor(id) {
  const d = queryOne(`SELECT * FROM doctors WHERE id=?`, [id]);
  if (!d) return;
  document.getElementById('d-id').value     = d.id;
  document.getElementById('d-name').value   = d.name;
  document.getElementById('d-spec').value   = d.specialization;
  document.getElementById('d-phone').value  = d.phone;
  document.getElementById('d-exp').value    = d.experience;
  document.getElementById('d-fee').value    = d.fee;
  document.getElementById('d-status').value = d.status;
  openModal('doctorModal');
}

function deleteDoctor(id) {
  if (!confirm('هل تريد حذف هذا الطبيب؟')) return;
  run(`DELETE FROM appointments WHERE doctor_id=?`, [id]);
  run(`DELETE FROM doctors WHERE id=?`, [id]);
  loadDoctors();
  toast('تم حذف الطبيب', 'error');
}

// ============================================================
// ACCOUNTS — حسابات الموظفين
// ============================================================

function loadAccounts() {
  const rows = query(`SELECT * FROM users ORDER BY id`);
  const grid = document.getElementById('accounts-grid');
  const roleMap = { admin: 'مدير النظام', doctor: 'طبيب', staff: 'موظف استقبال', nurse: 'ممرض/ممرضة' };
  const roleColors = {
    admin: 'rgba(232,67,147,0.15)', doctor: 'rgba(0,200,170,0.15)',
    staff: 'rgba(79,163,255,0.15)', nurse: 'rgba(247,201,72,0.15)'
  };
  const roleTextColors = {
    admin: 'var(--accent-3)', doctor: 'var(--accent)',
    staff: 'var(--info)', nurse: 'var(--warning)'
  };
  const avatarColors  = ['#e84393','#00c8aa','#4fa3ff','#f7c948'];
  const roleOrder = ['admin','doctor','staff','nurse'];
  grid.innerHTML = rows.map(u => {
    const ri = roleOrder.indexOf(u.role);
    const ac  = ['rgba(232,67,147,0.3)','rgba(0,200,170,0.3)','rgba(79,163,255,0.3)','rgba(247,201,72,0.3)'][ri] || 'rgba(0,200,170,0.3)';
    const atc = avatarColors[ri] || '#00c8aa';
    return `
    <div class="account-card">
      <div class="account-header">
        <div class="account-avatar" style="background:${ac};color:${atc}">${u.name.charAt(0)}</div>
        <div>
          <div class="account-name">${u.name}</div>
          <span class="account-role-badge" style="background:${roleColors[u.role]||'var(--surface-3)'};color:${roleTextColors[u.role]||'var(--text-2)'}">
            ${roleMap[u.role]||u.role}
          </span>
        </div>
        <div style="margin-right:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="editAccount(${u.id})" title="تعديل">✏️</button>
          ${u.id !== currentUser.id ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteAccount(${u.id})" title="حذف">🗑</button>` : ''}
        </div>
      </div>
      <div class="info-grid" style="grid-template-columns:1fr 1fr">
        <div class="info-item"><div class="info-label">اسم المستخدم</div><div class="info-value" style="direction:ltr">${u.username}</div></div>
        <div class="info-item"><div class="info-label">رقم الهاتف</div><div class="info-value" style="direction:ltr">${u.phone||'—'}</div></div>
        <div class="info-item" style="grid-column:span 2"><div class="info-label">القسم</div><div class="info-value">${u.department||'—'}</div></div>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${u.active?'var(--success)':'var(--danger)'}"></div>
        <span style="font-size:12px;color:var(--text-3)">${u.active?'نشط':'غير نشط'}</span>
      </div>
    </div>`;
  }).join('');
}

function saveAccount() {
  const id       = document.getElementById('acc-id').value;
  const name     = document.getElementById('acc-name').value.trim();
  const username = document.getElementById('acc-username').value.trim();
  const password = document.getElementById('acc-password').value;
  const role     = document.getElementById('acc-role').value;
  const phone    = document.getElementById('acc-phone').value;
  const dept     = document.getElementById('acc-dept').value;
  if (!name || !username) { toast('يرجى تعبئة الاسم واسم المستخدم', 'error'); return; }
  if (id) {
    const updates = [`name=?`,`username=?`,`role=?`,`phone=?`,`department=?`];
    const vals = [name, username, role, phone, dept];
    if (password) { updates.push(`password=?`); vals.push(password); }
    vals.push(id);
    run(`UPDATE users SET ${updates.join(',')} WHERE id=?`, vals);
    toast('تم تحديث الحساب ✅');
  } else {
    if (!password) { toast('يرجى إدخال كلمة المرور', 'error'); return; }
    const existing = queryOne(`SELECT id FROM users WHERE username=?`, [username]);
    if (existing) { toast('اسم المستخدم موجود مسبقاً', 'error'); return; }
    run(`INSERT INTO users(name,username,password,role,phone,department) VALUES(?,?,?,?,?,?)`,
        [name, username, password, role, phone, dept]);
    toast('تم إضافة الموظف بنجاح ✅');
  }
  closeModal('accountModal');
  loadAccounts();
}

function editAccount(id) {
  const u = queryOne(`SELECT * FROM users WHERE id=?`, [id]);
  if (!u) return;
  document.getElementById('acc-id').value       = u.id;
  document.getElementById('acc-name').value     = u.name;
  document.getElementById('acc-username').value = u.username;
  document.getElementById('acc-password').value = '';
  document.getElementById('acc-role').value     = u.role;
  document.getElementById('acc-phone').value    = u.phone||'';
  document.getElementById('acc-dept').value     = u.department||'';
  openModal('accountModal');
}

function deleteAccount(id) {
  if (id === currentUser.id) { toast('لا يمكنك حذف حسابك الخاص', 'error'); return; }
  if (!confirm('هل تريد حذف هذا الحساب؟')) return;
  run(`DELETE FROM users WHERE id=?`, [id]);
  loadAccounts();
  toast('تم حذف الحساب', 'error');
}

// ============================================================
// REPORTS — التقارير والإحصائيات
// ============================================================

function loadReports() {
  const totalPts        = queryOne(`SELECT COUNT(*) as c FROM patients`).c;
  const totalDocs       = queryOne(`SELECT COUNT(*) as c FROM doctors`).c;
  const totalAppts      = queryOne(`SELECT COUNT(*) as c FROM appointments`).c;
  const completedAppts  = queryOne(`SELECT COUNT(*) as c FROM appointments WHERE status='مكتمل'`).c;
  const cancelledAppts  = queryOne(`SELECT COUNT(*) as c FROM appointments WHERE status='ملغي'`).c;
  const topDoctors      = query(`SELECT d.name, d.specialization, COUNT(a.id) as cnt FROM doctors d LEFT JOIN appointments a ON a.doctor_id=d.id GROUP BY d.id ORDER BY cnt DESC LIMIT 5`);
  const bloodDist       = query(`SELECT blood_type, COUNT(*) as c FROM patients GROUP BY blood_type ORDER BY c DESC`);

  document.getElementById('reports-content').innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card accent"><div class="stat-icon">👥</div><div class="stat-value">${totalPts}</div><div class="stat-label">مريض مسجل</div></div>
      <div class="stat-card info"><div class="stat-icon">👨‍⚕️</div><div class="stat-value">${totalDocs}</div><div class="stat-label">طبيب</div></div>
      <div class="stat-card warning"><div class="stat-icon">📅</div><div class="stat-value">${totalAppts}</div><div class="stat-label">إجمالي الحجوزات</div></div>
      <div class="stat-card danger"><div class="stat-icon">✅</div><div class="stat-value">${totalAppts?Math.round(completedAppts/totalAppts*100):0}%</div><div class="stat-label">نسبة الاكتمال</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="widget">
        <div class="widget-title">🏆 أكثر الأطباء زيارةً</div>
        ${topDoctors.map((d,i)=>`
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:18px">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
            <div style="flex:1"><div style="font-size:14px;font-weight:700">${d.name}</div><div style="font-size:12px;color:var(--text-3)">${d.specialization}</div></div>
            <span style="font-family:'Tajawal',sans-serif;font-size:16px;font-weight:900;color:var(--accent)">${d.cnt}</span>
          </div>
        `).join('')}
      </div>
      <div class="widget">
        <div class="widget-title">📊 حالة الحجوزات</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px">
          ${[
            {label:'مكتمل',count:completedAppts,color:'var(--accent)'},
            {label:'ملغي',count:cancelledAppts,color:'var(--danger)'},
            {label:'معلق',count:totalAppts-completedAppts-cancelledAppts,color:'var(--warning)'},
          ].map(s=>`
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                <span>${s.label}</span><span style="font-weight:700;color:${s.color}">${s.count}</span>
              </div>
              <div style="height:8px;background:var(--bg-3);border-radius:99px;overflow:hidden">
                <div style="width:${totalAppts?s.count/totalAppts*100:0}%;height:100%;background:${s.color};border-radius:99px;transition:width 1s ease"></div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="divider"></div>
        <div class="widget-title" style="margin-bottom:12px">🩸 توزيع فصائل الدم</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${bloodDist.map(b=>`<span class="badge badge-danger">${b.blood_type}: ${b.c}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// HELPERS — دوال مساعدة متنوعة
// ============================================================

function populateApptSelects() {
  const doctors = query(`SELECT id, name, specialization FROM doctors WHERE status='متاح' ORDER BY name`);
  document.getElementById('a-doctor').innerHTML = doctors.map(d=>`<option value="${d.id}">${d.name} - ${d.specialization}</option>`).join('');
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  // Reset patient fields
  document.getElementById('a-patient-name').value = '';
  document.getElementById('a-patient').value = '';
  document.getElementById('patient-suggestions').innerHTML = '';
  document.getElementById('patient-suggestions').classList.remove('active');
}

function filterPatientSuggestions(val) {
  const box = document.getElementById('patient-suggestions');
  document.getElementById('a-patient').value = ''; // clear hidden id when typing
  if (!val || val.length < 1) { box.innerHTML=''; box.classList.remove('active'); return; }
  const pts = query(`SELECT id, name, phone FROM patients WHERE name LIKE ? OR phone LIKE ? LIMIT 8`,
    [`%${val}%`, `%${val}%`]);
  if (!pts.length) { box.innerHTML=`<div class="ac-empty">لا توجد نتائج</div>`; box.classList.add('active'); return; }
  box.innerHTML = pts.map(p=>`
    <div class="ac-item" onmousedown="selectPatient(${p.id}, '${p.name.replace(/'/g,"\\'")}')">
      <span class="ac-name">${p.name}</span>
      <span class="ac-phone">${p.phone||''}</span>
    </div>
  `).join('');
  box.classList.add('active');
}

function selectPatient(id, name) {
  document.getElementById('a-patient').value = id;
  document.getElementById('a-patient-name').value = name;
  const box = document.getElementById('patient-suggestions');
  box.innerHTML = ''; box.classList.remove('active');
}

function hideSuggestions() {
  const box = document.getElementById('patient-suggestions');
  box.classList.remove('active');
}

function statusBadge(s) {
  return { مجدول:'badge-info', مؤكد:'badge-warning', مكتمل:'badge-success', ملغي:'badge-danger' }[s] || 'badge-neutral';
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' });
}

function updateBadges() {
  const today   = new Date().toISOString().split('T')[0];
  const pending = queryOne(`SELECT COUNT(*) as c FROM appointments WHERE status IN ('مجدول','مؤكد') AND date>=?`, [today]).c;
  const badge   = document.getElementById('appt-badge');
  if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? '' : 'none'; }
}

// ============================================================
// MODAL — نوافذ الحوار
// ============================================================

function openModal(id) {
  if (id === 'apptModal') {
    populateApptSelects();
    document.getElementById('a-notes').value  = '';
    document.getElementById('a-status').value = 'مجدول';
  }
  if (id === 'patientModal') {
    document.getElementById('patient-modal-title').textContent = '👥 إضافة مريض جديد';
    document.getElementById('p-id').value = '';
    ['p-name','p-dob','p-phone','p-email','p-address','p-conditions'].forEach(f =>
      document.getElementById(f).value = ''
    );
  }
  if (id === 'doctorModal') {
    document.getElementById('d-id').value = '';
    ['d-name','d-phone','d-exp','d-fee'].forEach(f =>
      document.getElementById(f).value = ''
    );
  }
  if (id === 'accountModal') {
    document.getElementById('acc-id').value = '';
    ['acc-name','acc-username','acc-password','acc-phone','acc-dept'].forEach(f =>
      document.getElementById(f).value = ''
    );
  }
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// إغلاق النافذة عند الضغط على الخلفية
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ============================================================
// TOAST NOTIFICATIONS — إشعارات منبثقة
// ============================================================

function toast(msg, type='success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${type==='success'?'✅':'❌'}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-20px)';
    el.style.transition = 'all 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function showAlert(containerId, msg, type) {
  document.getElementById(containerId).innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => { document.getElementById(containerId).innerHTML = ''; }, 4000);
}

// ============================================================
// BOOT — تشغيل التطبيق
// ============================================================

window.addEventListener('load', async () => {
  const fill = document.getElementById('loader-fill');
  const text = document.getElementById('loader-text');
  const msgs = ['جاري تحميل المكتبات...','إنشاء قاعدة البيانات...','تحميل البيانات...','جاري التشطيب...'];
  let prog = 0;

  const interval = setInterval(() => {
    prog += 5;
    fill.style.width = Math.min(prog, 90) + '%';
    text.textContent = msgs[Math.min(Math.floor(prog/25), msgs.length-1)];
  }, 80);

  const ok = await initDB();
  clearInterval(interval);
  fill.style.width = '100%';
  text.textContent = 'جاهز!';

  setTimeout(() => {
    const ls = document.getElementById('loading-screen');
    ls.style.opacity = '0';
    setTimeout(() => {
      ls.style.display = 'none';
      document.getElementById('login-page').classList.add('active');
    }, 500);
  }, 400);
});
