const state = {
  currentUser: null,
  profile: null,
  classes: [],
  reservations: [],
  userReservations: [],
  plans: [],
  membership: null,
  roster: [],
  rosterClassId: null,
  notifications: [],
  view: "schedule",
};

const ADMIN_CODE = "COACH";
const elements = {
  authPanel: document.getElementById("authPanel"),
  scheduleView: document.getElementById("scheduleView"),
  profileView: document.getElementById("profileView"),
  adminView: document.getElementById("adminView"),
  adminNav: document.getElementById("adminNav"),
  navButtons: document.querySelectorAll(".nav-btn"),
  scheduleList: document.getElementById("scheduleList"),
  reservationList: document.getElementById("reservationList"),
  notificationList: document.getElementById("notificationList"),
  profileDetails: document.getElementById("profileDetails"),
  adminClassList: document.getElementById("adminClassList"),
  dateFilter: document.getElementById("dateFilter"),
  resetDate: document.getElementById("resetDate"),
  profilePhone: document.getElementById("profilePhone"),
  saveProfileBtn: document.getElementById("saveProfileBtn"),
  membershipDetails: document.getElementById("membershipDetails"),
  planOptions: document.getElementById("planOptions"),
  rosterSelect: document.getElementById("rosterSelect"),
  rosterList: document.getElementById("rosterList"),
  analyticsStart: document.getElementById("analyticsStart"),
  analyticsEnd: document.getElementById("analyticsEnd"),
  refreshAnalytics: document.getElementById("refreshAnalytics"),
  analyticsSummary: document.getElementById("analyticsSummary"),
  analyticsBreakdown: document.getElementById("analyticsBreakdown"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginBtn: document.getElementById("loginBtn"),
  loginHint: document.getElementById("loginHint"),
  signupName: document.getElementById("signupName"),
  signupEmail: document.getElementById("signupEmail"),
  signupPassword: document.getElementById("signupPassword"),
  adminCode: document.getElementById("adminCode"),
  signupBtn: document.getElementById("signupBtn"),
  signupHint: document.getElementById("signupHint"),
  logoutBtn: document.getElementById("logoutBtn"),
  classTitle: document.getElementById("classTitle"),
  classCoach: document.getElementById("classCoach"),
  classDate: document.getElementById("classDate"),
  classTime: document.getElementById("classTime"),
  classDuration: document.getElementById("classDuration"),
  classCapacity: document.getElementById("classCapacity"),
  createClassBtn: document.getElementById("createClassBtn"),
  adminHint: document.getElementById("adminHint"),
};

const supabaseClient =
  isConfigured() && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function isConfigured() {
  return SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR_");
}

function formatDate(date) {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time) {
  const [hour, minute] = time.split(":");
  const date = new Date();
  date.setHours(Number(hour));
  date.setMinutes(Number(minute));
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function setView(view) {
  state.view = view;
  elements.scheduleView.classList.toggle("hidden", view !== "schedule");
  elements.profileView.classList.toggle("hidden", view !== "profile");
  elements.adminView.classList.toggle("hidden", view !== "admin");
  elements.navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function showHint(el, message, isError = false) {
  el.textContent = message;
  el.style.color = isError ? "#b42318" : "#5f6b78";
}

async function fetchProfile() {
  if (!state.currentUser || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,name,role,phone,email")
    .eq("id", state.currentUser.id)
    .single();
  if (error) return null;
  return data;
}

async function updateProfile(phone) {
  if (!state.currentUser || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .update({ phone })
    .eq("id", state.currentUser.id)
    .select()
    .single();
  if (error) return null;
  return data;
}

async function ensureProfile(name, role) {
  if (!state.currentUser || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert(
      { id: state.currentUser.id, name, role, email: state.currentUser.email },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (error) return null;
  return data;
}

async function fetchClasses(date) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("classes")
    .select("id,title,coach,date,time,duration,capacity,created_by")
    .eq("date", date)
    .order("time", { ascending: true });
  if (error) return [];
  return data;
}

async function fetchPlans() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("membership_plans")
    .select("id,code,name,price_cents,billing_period,credits")
    .order("price_cents", { ascending: true });
  if (error) return [];
  return data;
}

async function fetchMembership() {
  if (!state.currentUser || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("memberships")
    .select("id,plan_id,status,credits_remaining,renewal_date,plan:membership_plans(code,name,price_cents,billing_period,credits)")
    .eq("user_id", state.currentUser.id)
    .single();
  if (error) return null;
  return data;
}

async function fetchReservations(classIds) {
  if (!supabaseClient) return [];
  if (classIds.length === 0) return [];
  const { data, error } = await supabaseClient
    .from("reservations")
    .select("id,class_id,user_id,status,created_at")
    .in("class_id", classIds)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data;
}

async function fetchUserReservations() {
  if (!state.currentUser || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("reservations")
    .select("id,status,classes:class_id(id,title,date,time)")
    .eq("user_id", state.currentUser.id)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data;
}

async function fetchRosterData(classId) {
  if (!supabaseClient || !classId) return [];
  const { data: reservations, error: resError } = await supabaseClient
    .from("reservations")
    .select("user_id,status,created_at")
    .eq("class_id", classId)
    .order("created_at", { ascending: true });
  if (resError || !reservations?.length) return [];

  const userIds = reservations.map((r) => r.user_id);
  const { data: profiles, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id,name,email,phone")
    .in("id", userIds);
  if (profileError) return [];

  const { data: attendance, error: attendanceError } = await supabaseClient
    .from("attendance")
    .select("user_id,checked_in_at")
    .eq("class_id", classId);
  if (attendanceError) return [];

  return reservations.map((res) => ({
    ...res,
    profile: profiles.find((p) => p.id === res.user_id),
    checked_in: attendance.some((a) => a.user_id === res.user_id),
  }));
}

async function loadRoster(classId) {
  state.rosterClassId = classId;
  state.roster = await fetchRosterData(classId);
  renderRoster();
}

async function refreshAnalytics() {
  const startDate = elements.analyticsStart.value;
  const endDate = elements.analyticsEnd.value;
  if (!startDate || !endDate) return;
  const { summary, breakdown } = await fetchAnalytics(startDate, endDate);
  renderAnalytics(summary, breakdown);
}

async function fetchAnalytics(startDate, endDate) {
  if (!supabaseClient) return { summary: {}, breakdown: [] };
  const { data: classes, error: classError } = await supabaseClient
    .from("classes")
    .select("id,title,date,time,capacity")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  if (classError || !classes) return { summary: {}, breakdown: [] };

  const classIds = classes.map((c) => c.id);
  const { data: reservations, error: resError } = await supabaseClient
    .from("reservations")
    .select("class_id,status")
    .in("class_id", classIds);
  if (resError) return { summary: {}, breakdown: [] };

  const { data: attendance, error: attError } = await supabaseClient
    .from("attendance")
    .select("class_id,user_id")
    .in("class_id", classIds);
  if (attError) return { summary: {}, breakdown: [] };

  const summary = {
    classes: classes.length,
    totalCapacity: classes.reduce((sum, c) => sum + c.capacity, 0),
    totalReserved: reservations.filter((r) => r.status === "reserved").length,
    totalWaitlist: reservations.filter((r) => r.status === "waitlist").length,
    totalCheckedIn: attendance.length,
  };

  const breakdown = classes.map((c) => {
    const classReservations = reservations.filter((r) => r.class_id === c.id);
    const reserved = classReservations.filter((r) => r.status === "reserved").length;
    const waitlist = classReservations.filter((r) => r.status === "waitlist").length;
    const checkedIn = attendance.filter((a) => a.class_id === c.id).length;
    return {
      ...c,
      reserved,
      waitlist,
      checkedIn,
    };
  });

  return { summary, breakdown };
}

async function fetchNotifications() {
  if (!state.currentUser || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("notifications")
    .select("id,message,created_at")
    .eq("user_id", state.currentUser.id)
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) return [];
  return data;
}

function computeSessionMeta(session) {
  const related = state.reservations.filter((r) => r.class_id === session.id);
  const reserved = related.filter((r) => r.status === "reserved");
  const waitlist = related.filter((r) => r.status === "waitlist");
  const userId = state.currentUser?.id;
  const isReserved = !!userId && reserved.some((r) => r.user_id === userId);
  const isWaitlisted = !!userId && waitlist.some((r) => r.user_id === userId);
  return {
    reservedCount: reserved.length,
    waitlistCount: waitlist.length,
    isReserved,
    isWaitlisted,
    spotsLeft: session.capacity - reserved.length,
  };
}

async function login() {
  if (!supabaseClient) return;
  const email = elements.loginEmail.value.trim().toLowerCase();
  const password = elements.loginPassword.value.trim();
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    showHint(elements.loginHint, error.message, true);
    return;
  }
  showHint(elements.loginHint, "Logged in.");
  state.currentUser = data.user;
  await refreshUI();
}

async function signup() {
  if (!supabaseClient) return;
  const name = elements.signupName.value.trim();
  const email = elements.signupEmail.value.trim().toLowerCase();
  const password = elements.signupPassword.value.trim();
  const adminCode = elements.adminCode.value.trim().toUpperCase();

  if (!name || !email || !password) {
    showHint(elements.signupHint, "Please fill in all fields.", true);
    return;
  }

  const role = adminCode === ADMIN_CODE ? "admin" : "member";
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { name, role } },
  });

  if (error) {
    showHint(elements.signupHint, error.message, true);
    return;
  }

  state.currentUser = data.user;
  await ensureProfile(name, role);
  showHint(elements.signupHint, "Account created. Check your email if confirmation is required.");
  await refreshUI();
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  state.currentUser = null;
  state.profile = null;
  refreshUI();
}

async function reserveSpot(classId) {
  if (!state.currentUser || !supabaseClient) return;
  const { error } = await supabaseClient.rpc("reserve_spot", { class_id: classId });
  if (error) {
    alert(error.message);
    return;
  }
  await refreshUI();
}

async function cancelSpot(classId) {
  if (!state.currentUser || !supabaseClient) return;
  const { error } = await supabaseClient.rpc("cancel_spot", { class_id: classId });
  if (error) {
    alert(error.message);
    return;
  }
  await refreshUI();
}

async function deleteClass(classId) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("classes").delete().eq("id", classId);
  if (error) {
    alert(error.message);
    return;
  }
  await refreshUI();
}

async function updateCapacity(classId, newCapacity) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.rpc("update_capacity", {
    class_id: classId,
    new_capacity: newCapacity,
  });
  if (error) {
    alert(error.message);
    return;
  }
  await refreshUI();
}

function renderSchedule() {
  const sessions = state.classes;

  if (sessions.length === 0) {
    elements.scheduleList.innerHTML = "<div class=\"card\">No classes scheduled for this date.</div>";
    return;
  }

  elements.scheduleList.innerHTML = sessions
    .map((session) => {
      const meta = computeSessionMeta(session);
      return `
        <div class="schedule-card">
          <h4>${session.title}</h4>
          <div class="muted">${formatDate(session.date)} · ${formatTime(session.time)} · ${session.duration} mins</div>
          <div class="muted">Coach: ${session.coach}</div>
          <div class="badge">${meta.spotsLeft > 0 ? `${meta.spotsLeft} spots left` : "Waitlist"}</div>
          <div class="action-row">
            ${meta.isReserved || meta.isWaitlisted ? "" : `<button data-action=\"reserve\" data-id=\"${session.id}\">${meta.spotsLeft > 0 ? "Reserve" : "Join Waitlist"}</button>`}
            ${meta.isReserved ? `<button class=\"ghost\" data-action=\"cancel\" data-id=\"${session.id}\">Cancel</button>` : ""}
            ${meta.isWaitlisted ? `<button class=\"ghost\" data-action=\"cancel\" data-id=\"${session.id}\">Leave Waitlist</button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderProfile() {
  const user = state.currentUser;
  const profile = state.profile;
  if (!user || !profile) return;

  const reservations = state.userReservations.filter((r) => r.status === "reserved");
  const waitlists = state.userReservations.filter((r) => r.status === "waitlist");

  elements.profileDetails.innerHTML = `
    <div><span>Name</span><strong>${profile.name}</strong></div>
    <div><span>Email</span><strong>${user.email}</strong></div>
    <div><span>Role</span><strong>${profile.role}</strong></div>
  `;
  elements.profilePhone.value = profile.phone || "";

  const membership = state.membership;
  elements.membershipDetails.innerHTML = membership
    ? `
      <div><span>Plan</span><strong>${membership.plan?.name || "Unknown"}</strong></div>
      <div><span>Status</span><strong>${membership.status}</strong></div>
      <div><span>Credits</span><strong>${membership.credits_remaining ?? "Unlimited"}</strong></div>
    `
    : `<div><span>Status</span><strong>No plan</strong></div>`;

  elements.planOptions.innerHTML = state.plans
    .map((plan) => {
      const isActive = membership && membership.plan_id === plan.id && membership.status === "active";
      return `
        <div class="plan-card">
          <div class="tag">${plan.billing_period.toUpperCase()}</div>
          <h4>${plan.name}</h4>
          <div class="muted">$${(plan.price_cents / 100).toFixed(0)}${plan.credits ? ` · ${plan.credits} credits` : ""}</div>
          <button class="ghost" data-action="select-plan" data-id="${plan.id}" ${isActive ? "disabled" : ""}>
            ${isActive ? "Active" : "Activate Plan"}
          </button>
        </div>
      `;
    })
    .join("");

  const reservationItems = reservations
    .map((res) => {
      const session = res.classes;
      if (!session) return "";
      return `
      <div class="list-item">
        <strong>${session.title}</strong><br />
        ${formatDate(session.date)} · ${formatTime(session.time)}
        <button class="ghost" data-action="cancel" data-id="${session.id}">Cancel</button>
      </div>
    `;
    })
    .join("");

  const waitItems = waitlists
    .map((res) => {
      const session = res.classes;
      if (!session) return "";
      return `
      <div class="list-item">
        <strong>${session.title}</strong><br />
        Waitlist · ${formatDate(session.date)} · ${formatTime(session.time)}
        <button class="ghost" data-action="cancel" data-id="${session.id}">Leave Waitlist</button>
      </div>
    `;
    })
    .join("");

  elements.reservationList.innerHTML =
    reservationItems || waitItems
      ? `<div class="list">${reservationItems}${waitItems}</div>`
      : "<div class=\"muted\">No upcoming classes yet.</div>";

  elements.notificationList.innerHTML = state.notifications.length
    ? `<div class="list">${state.notifications
        .map(
          (note) => `
        <div class="list-item">
          ${note.message}
          <div class="muted">${new Date(note.created_at).toLocaleString()}</div>
        </div>
      `
        )
        .join("")}</div>`
    : "<div class=\"muted\">No notifications yet.</div>";
}

function renderAdmin() {
  const profile = state.profile;
  elements.adminNav.classList.toggle("hidden", !profile || profile.role !== "admin");
  if (!profile || profile.role !== "admin") {
    elements.adminView.classList.add("hidden");
    return;
  }
  elements.adminClassList.innerHTML = state.classes
    .map(
      (session) => `
      <div class="list-item">
        <strong>${session.title}</strong><br />
        ${formatDate(session.date)} · ${formatTime(session.time)} · ${session.capacity} cap
        <div class="muted">Reserved ${computeSessionMeta(session).reservedCount} · Waitlist ${computeSessionMeta(session).waitlistCount}</div>
        <label>Capacity</label>
        <input type="number" min="4" max="40" value="${session.capacity}" data-action="capacity" data-id="${session.id}" />
        <button class="ghost" data-action="delete" data-id="${session.id}">Delete</button>
      </div>
    `
    )
    .join("");

  elements.rosterSelect.innerHTML = state.classes
    .map(
      (session) =>
        `<option value="${session.id}">${formatDate(session.date)} · ${formatTime(session.time)} · ${session.title}</option>`
    )
    .join("");
}

function renderRoster() {
  if (!state.roster || state.roster.length === 0) {
    elements.rosterList.innerHTML = "<div class=\"muted\">Select a class to see attendees.</div>";
    return;
  }
  elements.rosterList.innerHTML = state.roster
    .map((entry) => {
      const name = entry.profile?.name || "Member";
      const email = entry.profile?.email || "";
      const phone = entry.profile?.phone || "";
      const statusTag = entry.status === "reserved" ? "Reserved" : "Waitlist";
      const isWaitlist = entry.status === "waitlist";
      const buttonLabel = entry.checked_in ? "Undo" : "Check-in";
      const action = entry.checked_in ? "undo-checkin" : "checkin";
      return `
        <div class="list-item">
          <strong>${name}</strong><br />
          <span class="muted">${email} ${phone ? "· " + phone : ""}</span><br />
          <span class="badge">${statusTag}</span>
          <button class="ghost" data-action="${action}" data-id="${entry.user_id}" data-class="${state.rosterClassId}" ${isWaitlist ? "disabled" : ""}>${buttonLabel}</button>
        </div>
      `;
    })
    .join("");
}

function renderAnalytics(summary, breakdown) {
  elements.analyticsSummary.innerHTML = `
    <div><span>Classes</span><strong>${summary.classes || 0}</strong></div>
    <div><span>Total Capacity</span><strong>${summary.totalCapacity || 0}</strong></div>
    <div><span>Reserved</span><strong>${summary.totalReserved || 0}</strong></div>
    <div><span>Waitlist</span><strong>${summary.totalWaitlist || 0}</strong></div>
    <div><span>Checked-in</span><strong>${summary.totalCheckedIn || 0}</strong></div>
  `;

  elements.analyticsBreakdown.innerHTML = breakdown.length
    ? breakdown
        .map(
          (row) => `
        <div class="list-item">
          <strong>${row.title}</strong><br />
          ${formatDate(row.date)} · ${formatTime(row.time)}<br />
          <span class="muted">Reserved ${row.reserved} · Waitlist ${row.waitlist} · Checked-in ${row.checkedIn} / ${row.capacity}</span>
        </div>
      `
        )
        .join("")
    : "<div class=\"muted\">No classes in this range.</div>";
}

async function refreshUI() {
  if (!state.currentUser) {
    elements.authPanel.classList.remove("hidden");
    elements.scheduleView.classList.add("hidden");
    elements.profileView.classList.add("hidden");
    elements.adminView.classList.add("hidden");
    elements.adminNav.classList.add("hidden");
    return;
  }

  const filterDate = elements.dateFilter.value || new Date().toISOString().slice(0, 10);
  const classes = await fetchClasses(filterDate);
  const reservations = await fetchReservations(classes.map((c) => c.id));
  const userReservations = await fetchUserReservations();
  const plans = await fetchPlans();
  const membership = await fetchMembership();

  state.profile = (await fetchProfile()) || (await ensureProfile(state.currentUser.user_metadata?.name || "Member", "member"));
  state.classes = classes;
  state.reservations = reservations;
  state.userReservations = userReservations;
  state.plans = plans;
  state.membership = membership;
  state.notifications = await fetchNotifications();

  elements.authPanel.classList.add("hidden");
  elements.scheduleView.classList.remove("hidden");
  renderSchedule();
  renderProfile();
  renderAdmin();
  if (state.profile?.role === "admin") {
    const firstClassId = state.classes[0]?.id;
    if (firstClassId) {
      elements.rosterSelect.value = firstClassId;
      await loadRoster(firstClassId);
    } else {
      state.roster = [];
      renderRoster();
    }
    await refreshAnalytics();
  }
}

async function createClassFromAdmin() {
  if (!supabaseClient) return;
  const title = elements.classTitle.value.trim();
  const coach = elements.classCoach.value.trim();
  const date = elements.classDate.value;
  const time = elements.classTime.value;
  const duration = Number(elements.classDuration.value || 60);
  const capacity = Number(elements.classCapacity.value || 16);

  if (!title || !coach || !date || !time) {
    showHint(elements.adminHint, "Fill out all fields.", true);
    return;
  }

  const { error } = await supabaseClient.from("classes").insert({
    title,
    coach,
    date,
    time,
    duration,
    capacity,
    created_by: state.currentUser.id,
  });

  if (error) {
    showHint(elements.adminHint, error.message, true);
    return;
  }

  showHint(elements.adminHint, "Class created.");
  elements.classTitle.value = "";
  elements.classCoach.value = "";
  await refreshUI();
}

function setupListeners() {
  elements.loginBtn.addEventListener("click", login);
  elements.signupBtn.addEventListener("click", signup);
  elements.logoutBtn.addEventListener("click", logout);
  elements.createClassBtn.addEventListener("click", createClassFromAdmin);
  elements.saveProfileBtn.addEventListener("click", async () => {
    const phone = elements.profilePhone.value.trim();
    const updated = await updateProfile(phone);
    if (updated) {
      state.profile = updated;
      renderProfile();
    }
  });
  elements.rosterSelect.addEventListener("change", async (event) => {
    await loadRoster(event.target.value);
  });
  elements.refreshAnalytics.addEventListener("click", refreshAnalytics);
  elements.resetDate.addEventListener("click", async () => {
    elements.dateFilter.value = new Date().toISOString().slice(0, 10);
    await refreshUI();
  });
  elements.dateFilter.addEventListener("change", refreshUI);

  elements.navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view === "admin" && (!state.profile || state.profile.role !== "admin")) {
        return;
      }
      setView(view);
      renderSchedule();
      renderProfile();
      renderAdmin();
    });
  });

  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!action || !id) return;
    if (action === "reserve") reserveSpot(id);
    if (action === "cancel") cancelSpot(id);
    if (action === "delete") deleteClass(id);
    if (action === "select-plan") selectPlan(id);
    if (action === "checkin") checkInMember(button.dataset.class, id);
    if (action === "undo-checkin") undoCheckIn(button.dataset.class, id);
  });

  document.body.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.action === "capacity") {
      updateCapacity(input.dataset.id, Number(input.value));
    }
  });
}

async function init() {
  if (!supabaseClient) {
    alert("Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js before running.");
    return;
  }

  elements.dateFilter.value = new Date().toISOString().slice(0, 10);
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 6);
  elements.analyticsStart.value = weekAgo.toISOString().slice(0, 10);
  elements.analyticsEnd.value = today.toISOString().slice(0, 10);
  setView("schedule");
  setupListeners();

  const { data } = await supabaseClient.auth.getSession();
  state.currentUser = data.session?.user || null;

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    state.currentUser = session?.user || null;
    refreshUI();
  });

  refreshUI();
}

init();
async function selectPlan(planId) {
  if (!state.currentUser || !supabaseClient) return;
  const { error } = await supabaseClient.rpc("select_plan", { plan_id: planId });
  if (error) {
    alert(error.message);
    return;
  }
  await refreshUI();
}

async function checkInMember(classId, userId) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.rpc("check_in", { class_id: classId, user_id: userId });
  if (error) {
    alert(error.message);
    return;
  }
  await loadRoster(classId);
  await refreshAnalytics();
}

async function undoCheckIn(classId, userId) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.rpc("undo_check_in", { class_id: classId, user_id: userId });
  if (error) {
    alert(error.message);
    return;
  }
  await loadRoster(classId);
  await refreshAnalytics();
}
