import type { Lang, Theme } from '@/types/auth';

export const LANG_KEY = 'ug_lang';
export const THEME_KEY = 'ug_theme';

export type Messages = {
  brand: string;
  platformEyebrow: string;
  operatorSignIn: string;
  companySignIn: string;
  companyCode: string;
  companyCodeHint: string;
  username: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  submit: string;
  submitting: string;
  required: string;
  optional: string;
  wrongCredentials: string;
  inactive: string;
  locked: string;
  network: string;
  companySuspended: string;
  subscriptionExpired: string;
  checking: string;
  languageLabel: string;
  arabic: string;
  english: string;
  themeLabel: string;
  dayMode: string;
  nightMode: string;
  logout: string;
  menu: string;
  closeMenu: string;
  account: string;
  platformContext: string;
  companyContext: string;
  supportBanner: string;
  supportSuspended: string;
  leaveCompany: string;
  manageModules: string;
  navDashboard: string;
  navCompanies: string;
  navAudit: string;
  navBranches: string;
  navUsers: string;
  navRoles: string;
  navModules: string;
  active: string;
  suspended: string;
  inactiveStatus: string;
  all: string;
  search: string;
  noResults: string;
  empty: string;
  forbidden: string;
  notFound: string;
  retry: string;
  save: string;
  saved: string;
  cancel: string;
  confirm: string;
  back: string;
  open: string;
  edit: string;
  create: string;
  previous: string;
  next: string;
  page: string;
  of: string;
  dashboardTitle: string;
  activeCompanies: string;
  suspendedCompanies: string;
  recentSupport: string;
  noSupportYet: string;
  newCompany: string;
  companiesTitle: string;
  name: string;
  code: string;
  status: string;
  expires: string;
  price: string;
  createCompany: string;
  identity: string;
  subscription: string;
  preset: string;
  presetTradiv: string;
  presetSimple: string;
  presetTradivHint: string;
  presetSimpleHint: string;
  modulesSection: string;
  modulesHint: string;
  branchHint: string;
  codeHint: string;
  codeInvalid: string;
  codeTaken: string;
  datePastNotice: string;
  companyDetails: string;
  editSubscription: string;
  enterCompany: string;
  enterTitle: string;
  enterBody: string;
  countsBranches: string;
  countsUsers: string;
  enabledModules: string;
  none: string;
  suspendCompany: string;
  suspendBody: string;
  activateCompany: string;
  activateNeedsDate: string;
  dangerZone: string;
  modulesTitle: string;
  notReadyYet: string;
  disableModuleBody: string;
  auditTitle: string;
  time: string;
  operator: string;
  action: string;
  target: string;
  filterCompany: string;
  actionEnter: string;
  actionCreate: string;
  actionUpdate: string;
  actionDelete: string;
  welcome: string;
  yourRole: string;
  yourScope: string;
  scopeAll: string;
  scopeBranch: string;
  scopeOwn: string;
  allBranches: string;
  noModules: string;
  branchesTitle: string;
  newBranch: string;
  editBranch: string;
  branchName: string;
  nameTaken: string;
  deactivate: string;
  deactivateBranchBody: string;
  readOnly: string;
  usersTitle: string;
  newUser: string;
  editUser: string;
  email: string;
  phone: string;
  role: string;
  branch: string;
  passwordRules: string;
  passwordShort: string;
  passwordWeak: string;
  passwordMismatch: string;
  resetPassword: string;
  newPassword: string;
  confirmPassword: string;
  currentPassword: string;
  passwordSaved: string;
  deactivateUserBody: string;
  roleChangeBody: string;
  financeWarning: string;
  locationRequired: string;
  rolesTitle: string;
  newRole: string;
  editRole: string;
  roleKey: string;
  roleKeyHint: string;
  roleKeyInvalid: string;
  keyTaken: string;
  manageUsersFlag: string;
  editApproval: string;
  deleteApproval: string;
  approvalHint: string;
  rolesReadOnly: string;
  modulesOverview: string;
  ready: string;
  placeholderTitle: string;
  placeholderBody: string;
  backDashboard: string;
  unknownSection: string;
  accountTitle: string;
  appearance: string;
  changePassword: string;
  supportStillOpen: string;
  moduleFinance: string;
  moduleExchange: string;
  moduleGold: string;
  moduleAviation: string;
  moduleEngineering: string;
  moduleHr: string;
};

const ar: Messages = {
  brand: 'Unigate',
  platformEyebrow: 'إدارة المنصة',
  operatorSignIn: 'دخول المشغّلين',
  companySignIn: 'دخول الشركة',
  companyCode: 'رمز الشركة',
  companyCodeHint: 'بالإنجليزية، كما استلمتموه من Unigate',
  username: 'اسم المستخدم',
  password: 'كلمة المرور',
  showPassword: 'إظهار',
  hidePassword: 'إخفاء',
  submit: 'دخول',
  submitting: 'جاري الدخول',
  required: 'مطلوب',
  optional: 'اختياري',
  wrongCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  inactive: 'هذا الحساب موقوف. راجع إدارة Unigate.',
  locked: 'الحساب مقفل مؤقتاً. حاول بعد ربع ساعة.',
  network: 'تعذر الاتصال بالخادم.',
  companySuspended: 'الشركة موقوفة. راجع إدارة شركتك.',
  subscriptionExpired: 'انتهى الاشتراك. راجع Unigate.',
  checking: 'جاري التحقق من الجلسة',
  languageLabel: 'اللغة',
  arabic: 'العربية',
  english: 'English',
  themeLabel: 'المظهر',
  dayMode: 'نهاري',
  nightMode: 'ليلي',
  logout: 'خروج',
  menu: 'القائمة',
  closeMenu: 'إغلاق القائمة',
  account: 'الحساب',
  platformContext: 'منصة',
  companyContext: 'شركة',
  supportBanner: 'دعم Unigate — أنت داخل شركة',
  supportSuspended: 'هذه الشركة موقوفة',
  leaveCompany: 'مغادرة الشركة',
  manageModules: 'إدارة وحدات الاشتراك',
  navDashboard: 'لوحة المنصة',
  navCompanies: 'الشركات',
  navAudit: 'سجل الدعم',
  navBranches: 'الفروع',
  navUsers: 'المستخدمون',
  navRoles: 'الأدوار',
  navModules: 'الوحدات',
  active: 'نشطة',
  suspended: 'موقوفة',
  inactiveStatus: 'موقوف',
  all: 'الكل',
  search: 'بحث',
  noResults: 'لا نتائج مطابقة.',
  empty: 'لا سجلات بعد.',
  forbidden: 'لا تملك صلاحية هذا الإجراء.',
  notFound: 'السجل غير موجود.',
  retry: 'إعادة المحاولة',
  save: 'حفظ',
  saved: 'تم الحفظ.',
  cancel: 'رجوع',
  confirm: 'تأكيد',
  back: 'العودة إلى اللوحة',
  open: 'فتح',
  edit: 'تعديل',
  create: 'إنشاء',
  previous: 'السابق',
  next: 'التالي',
  page: 'صفحة',
  of: 'من',
  dashboardTitle: 'لوحة المنصة',
  activeCompanies: 'شركات نشطة',
  suspendedCompanies: 'شركات موقوفة',
  recentSupport: 'آخر عمليات الدعم',
  noSupportYet: 'لا عمليات دعم بعد.',
  newCompany: 'شركة جديدة',
  companiesTitle: 'الشركات',
  name: 'الاسم',
  code: 'الرمز',
  status: 'الحالة',
  expires: 'تاريخ الانتهاء',
  price: 'السعر',
  createCompany: 'إنشاء شركة',
  identity: 'الهوية',
  subscription: 'الاشتراك',
  preset: 'قالب الأدوار',
  presetTradiv: 'أربعة أدوار',
  presetSimple: 'مالك وموظف',
  presetTradivHint: 'مدير عام، مراقب، مشرف، موظف.',
  presetSimpleHint: 'مالك يرى كل الفروع، وموظف على فرعه.',
  modulesSection: 'الوحدات',
  modulesHint: 'يمكن تركها كلها مغلقة.',
  branchHint: 'يُنشأ فرع واحد بنفس الاسم داخل نفس الاشتراك.',
  codeHint: 'أحرف إنجليزية صغيرة، ويُستخدم في الدخول.',
  codeInvalid: 'الرمز من حرفين إلى 32: أحرف صغيرة أو أرقام أو شرطة.',
  codeTaken: 'هذا الرمز مستخدم لشركة أخرى.',
  datePastNotice: 'هذا التاريخ يوقف الدخول إلى أن يُمدَّد.',
  companyDetails: 'تفاصيل الشركة',
  editSubscription: 'تعديل الاشتراك',
  enterCompany: 'الدخول إلى الشركة',
  enterTitle: 'الدخول للدعم',
  enterBody: 'سيُسجَّل الدخول. ترى كل الفروع، والتعديل والحذف مباشر دون موافقة الموظف.',
  countsBranches: 'الفروع',
  countsUsers: 'المستخدمون',
  enabledModules: 'وحدات مفتوحة',
  none: 'لا يوجد',
  suspendCompany: 'إيقاف الشركة',
  suspendBody: 'مستخدموها لن يدخلوا. البيانات تبقى، وفريق Unigate يستطيع الدخول.',
  activateCompany: 'إعادة التشغيل',
  activateNeedsDate: 'تاريخ انتهاء جديد',
  dangerZone: 'إجراءات حساسة',
  modulesTitle: 'وحدات الشركة',
  notReadyYet: 'غير جاهزة بعد',
  disableModuleBody: 'تختفي عن مستخدمي الشركة. البيانات لا تُحذف.',
  auditTitle: 'سجل الدعم',
  time: 'الوقت',
  operator: 'المشغّل',
  action: 'الإجراء',
  target: 'الهدف',
  filterCompany: 'الشركة',
  actionEnter: 'دخول',
  actionCreate: 'إنشاء',
  actionUpdate: 'تعديل',
  actionDelete: 'حذف',
  welcome: 'لوحة الشركة',
  yourRole: 'دورك',
  yourScope: 'النطاق',
  scopeAll: 'كل الفروع',
  scopeBranch: 'فرعه',
  scopeOwn: 'عملياته',
  allBranches: 'كل الفروع',
  noModules: 'لا توجد وحدات مفعّلة. تواصل مع Unigate Services.',
  branchesTitle: 'الفروع',
  newBranch: 'فرع جديد',
  editBranch: 'تعديل الفرع',
  branchName: 'اسم الفرع',
  nameTaken: 'الاسم مستخدم داخل هذه الشركة.',
  deactivate: 'إيقاف',
  deactivateBranchBody: 'لا يُختار للعمليات الجديدة. السجل القديم يبقى.',
  readOnly: 'عرض فقط.',
  usersTitle: 'المستخدمون',
  newUser: 'مستخدم جديد',
  editUser: 'تعديل المستخدم',
  email: 'البريد',
  phone: 'الهاتف',
  role: 'الدور',
  branch: 'الفرع',
  passwordRules: 'ثمانية أحرف على الأقل، وفيها حرف ورقم.',
  passwordShort: 'كلمة المرور أقصر من ثمانية أحرف.',
  passwordWeak: 'يجب أن تحتوي حرفاً ورقماً.',
  passwordMismatch: 'تأكيد كلمة المرور غير مطابق.',
  resetPassword: 'إعادة تعيين كلمة المرور',
  newPassword: 'كلمة المرور الجديدة',
  confirmPassword: 'تأكيد كلمة المرور',
  currentPassword: 'كلمة المرور الحالية',
  passwordSaved: 'تم تغيير كلمة المرور.',
  deactivateUserBody: 'لن يستطيع هذا المستخدم الدخول.',
  roleChangeBody: 'تغيير الدور يغيّر الصلاحية فوراً.',
  financeWarning: 'الحساب أُنشئ. شاشات المالية لا تفتح لهذا الدور حتى يُضاف عند قسم المالية.',
  locationRequired: 'اختر الفرع لهذا الدور.',
  rolesTitle: 'الأدوار',
  newRole: 'دور جديد',
  editRole: 'تعديل الدور',
  roleKey: 'المفتاح',
  roleKeyHint: 'بالإنجليزية الكبيرة، مثل GENERAL_MANAGER.',
  roleKeyInvalid: 'المفتاح يبدأ بحرف كبير، ثم حروف أو أرقام أو شرطة سفلية.',
  keyTaken: 'هذا المفتاح مستخدم داخل الشركة.',
  manageUsersFlag: 'إدارة المستخدمين',
  editApproval: 'التعديل يحتاج موافقة',
  deleteApproval: 'الحذف يحتاج موافقة',
  approvalHint: 'مشغّل Unigate يتجاوز الموافقة عند الدعم.',
  rolesReadOnly: 'تعديل الأدوار من Unigate.',
  modulesOverview: 'الوحدات',
  ready: 'جاهزة',
  placeholderTitle: 'هذا القسم غير جاهز بعد.',
  placeholderBody: 'لا توجد عمليات في هذا القسم حالياً.',
  backDashboard: 'العودة إلى اللوحة',
  unknownSection: 'قسم غير معروف.',
  accountTitle: 'الحساب',
  appearance: 'المظهر',
  changePassword: 'تغيير كلمة المرور',
  supportStillOpen: 'جلسة دعم مفتوحة',
  moduleFinance: 'المالية',
  moduleExchange: 'الصرافة',
  moduleGold: 'الذهب',
  moduleAviation: 'الطيران',
  moduleEngineering: 'الهندسة',
  moduleHr: 'الموارد البشرية',
};

const en: Messages = {
  brand: 'Unigate',
  platformEyebrow: 'Platform administration',
  operatorSignIn: 'Operator sign in',
  companySignIn: 'Company sign in',
  companyCode: 'Company code',
  companyCodeHint: 'In English, as Unigate gave it to you',
  username: 'Username',
  password: 'Password',
  showPassword: 'Show',
  hidePassword: 'Hide',
  submit: 'Sign in',
  submitting: 'Signing in',
  required: 'Required',
  optional: 'Optional',
  wrongCredentials: 'Username or password is incorrect.',
  inactive: 'This account is inactive. Contact a Unigate administrator.',
  locked: 'This account is temporarily locked. Try again in 15 minutes.',
  network: 'Could not reach the server.',
  companySuspended: 'This company is suspended. Contact your administrator.',
  subscriptionExpired: 'The subscription has ended. Contact Unigate.',
  checking: 'Checking session',
  languageLabel: 'Language',
  arabic: 'العربية',
  english: 'English',
  themeLabel: 'Appearance',
  dayMode: 'Day',
  nightMode: 'Night',
  logout: 'Sign out',
  menu: 'Menu',
  closeMenu: 'Close menu',
  account: 'Account',
  platformContext: 'Platform',
  companyContext: 'Company',
  supportBanner: 'Unigate support — you are inside',
  supportSuspended: 'This company is suspended',
  leaveCompany: 'Leave company',
  manageModules: 'Manage subscription modules',
  navDashboard: 'Platform home',
  navCompanies: 'Companies',
  navAudit: 'Support log',
  navBranches: 'Branches',
  navUsers: 'Users',
  navRoles: 'Roles',
  navModules: 'Modules',
  active: 'Active',
  suspended: 'Suspended',
  inactiveStatus: 'Inactive',
  all: 'All',
  search: 'Search',
  noResults: 'No matching records.',
  empty: 'No records yet.',
  forbidden: 'You do not have permission for this action.',
  notFound: 'This record was not found.',
  retry: 'Try again',
  save: 'Save',
  saved: 'Saved.',
  cancel: 'Back',
  confirm: 'Confirm',
  back: 'Back to the dashboard',
  open: 'Open',
  edit: 'Edit',
  create: 'Create',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  of: 'of',
  dashboardTitle: 'Platform home',
  activeCompanies: 'Active companies',
  suspendedCompanies: 'Suspended companies',
  recentSupport: 'Latest support actions',
  noSupportYet: 'No support actions yet.',
  newCompany: 'New company',
  companiesTitle: 'Companies',
  name: 'Name',
  code: 'Code',
  status: 'Status',
  expires: 'End date',
  price: 'Price',
  createCompany: 'Create company',
  identity: 'Identity',
  subscription: 'Subscription',
  preset: 'Role template',
  presetTradiv: 'Four roles',
  presetSimple: 'Owner and staff',
  presetTradivHint: 'General manager, monitor, supervisor, employee.',
  presetSimpleHint: 'An owner sees every branch. Staff stay on their branch.',
  modulesSection: 'Modules',
  modulesHint: 'You can leave all of them off.',
  branchHint: 'One branch is created with the same name, inside the same subscription.',
  codeHint: 'Lowercase English letters. Used at sign-in.',
  codeInvalid: 'Use 2–32 characters: lowercase letters, digits, or a hyphen.',
  codeTaken: 'Another company already uses this code.',
  datePastNotice: 'This date stops sign-in until it is extended.',
  companyDetails: 'Company details',
  editSubscription: 'Edit subscription',
  enterCompany: 'Enter company',
  enterTitle: 'Enter for support',
  enterBody: 'This entry is logged. You see every branch, and edits and deletes skip employee approval.',
  countsBranches: 'Branches',
  countsUsers: 'Users',
  enabledModules: 'Enabled modules',
  none: 'None',
  suspendCompany: 'Suspend company',
  suspendBody: 'Its users cannot sign in. Data stays, and Unigate can still enter.',
  activateCompany: 'Reactivate',
  activateNeedsDate: 'New end date',
  dangerZone: 'Sensitive actions',
  modulesTitle: 'Company modules',
  notReadyYet: 'Not ready yet',
  disableModuleBody: 'It disappears for company users. Data is not deleted.',
  auditTitle: 'Support log',
  time: 'Time',
  operator: 'Operator',
  action: 'Action',
  target: 'Target',
  filterCompany: 'Company',
  actionEnter: 'Enter',
  actionCreate: 'Create',
  actionUpdate: 'Update',
  actionDelete: 'Delete',
  welcome: 'Company home',
  yourRole: 'Your role',
  yourScope: 'Scope',
  scopeAll: 'All branches',
  scopeBranch: 'Their branch',
  scopeOwn: 'Their own operations',
  allBranches: 'All branches',
  noModules: 'No modules are enabled. Contact Unigate Services.',
  branchesTitle: 'Branches',
  newBranch: 'New branch',
  editBranch: 'Edit branch',
  branchName: 'Branch name',
  nameTaken: 'This name is already used in this company.',
  deactivate: 'Deactivate',
  deactivateBranchBody: 'It cannot be chosen for new work. The old record stays.',
  readOnly: 'View only.',
  usersTitle: 'Users',
  newUser: 'New user',
  editUser: 'Edit user',
  email: 'Email',
  phone: 'Phone',
  role: 'Role',
  branch: 'Branch',
  passwordRules: 'At least 8 characters, with a letter and a number.',
  passwordShort: 'Password is shorter than 8 characters.',
  passwordWeak: 'Include both a letter and a number.',
  passwordMismatch: 'Password confirmation does not match.',
  resetPassword: 'Reset password',
  newPassword: 'New password',
  confirmPassword: 'Confirm password',
  currentPassword: 'Current password',
  passwordSaved: 'Password changed.',
  deactivateUserBody: 'This user will not be able to sign in.',
  roleChangeBody: 'Changing the role updates access immediately.',
  financeWarning: 'The account was created. Finance screens stay closed for this role until finance permissions are updated.',
  locationRequired: 'Choose a branch for this role.',
  rolesTitle: 'Roles',
  newRole: 'New role',
  editRole: 'Edit role',
  roleKey: 'Key',
  roleKeyHint: 'Uppercase English, such as GENERAL_MANAGER.',
  roleKeyInvalid: 'Start with a capital letter, then letters, digits, or underscores.',
  keyTaken: 'This key is already used in the company.',
  manageUsersFlag: 'Manage users',
  editApproval: 'Edits edits need approval',
  deleteApproval: 'Its deletes need approval',
  approvalHint: 'A Unigate operator bypasses approval during support.',
  rolesReadOnly: 'Role changes are made by Unigate.',
  modulesOverview: 'Modules',
  ready: 'Ready',
  placeholderTitle: 'This section is not ready yet.',
  placeholderBody: 'There is no work to do in this section yet.',
  backDashboard: 'Back to the dashboard',
  unknownSection: 'Unknown section.',
  accountTitle: 'Account',
  appearance: 'Appearance',
  changePassword: 'Change password',
  supportStillOpen: 'Support session is open',
  moduleFinance: 'Finance',
  moduleExchange: 'Exchange',
  moduleGold: 'Gold',
  moduleAviation: 'Aviation',
  moduleEngineering: 'Engineering',
  moduleHr: 'Human resources',
};

export const messages: Record<Lang, Messages> = { ar, en };

export function isLang(value: string | null): value is Lang {
  return value === 'ar' || value === 'en';
}

export function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

export function moduleLabel(key: string, copy: Messages) {
  if (key === 'finance') return copy.moduleFinance;
  if (key === 'exchange') return copy.moduleExchange;
  if (key === 'gold') return copy.moduleGold;
  if (key === 'aviation') return copy.moduleAviation;
  if (key === 'engineering') return copy.moduleEngineering;
  if (key === 'hr') return copy.moduleHr;
  return key;
}
