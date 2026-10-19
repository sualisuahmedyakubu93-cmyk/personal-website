"use strict";

/*
 * YASU Tech — Staff Management
 * File: admin/staff-management.js
 *
 * Backend permissions remain the security boundary.
 * This file manages the dashboard interface and API requests.
 */

(() => {
    const API_BASE = "/api/staff-management";

    const $ = (selector) => document.querySelector(selector);

    const message = $("#staffManagementMessage");

    if (!message || !$("#staffUsersTableBody")) {
        console.warn(
            "YASU Tech Staff Management: expected dashboard elements were not found."
        );
        return;
    }

    const views = {
        users: $("#staffViewUsers"),
        roles: $("#staffViewRoles"),
        permissions: $("#staffViewPermissions"),
        departments: $("#staffViewDepartments"),
        audit: $("#staffViewAudit")
    };

    const state = {
        roles: [],
        permissions: [],
        users: []
    };

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.style.color = isError ? "#b42318" : "";
    }

    function getToken() {
        return (
            localStorage.getItem("userToken") ||
            sessionStorage.getItem("userToken")
        );
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error(
                "Your login session was not found. Please sign in again."
            );
        }

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        };

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        let data;

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok || data.success === false) {
            throw new Error(
                data.message ||
                data.error ||
                `The request failed (HTTP ${response.status}).`
            );
        }

        return data;
    }

    function createElement(tag, text, className) {
        const element = document.createElement(tag);

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        if (className) {
            element.className = className;
        }

        return element;
    }

    function createCell(value) {
        const cell = document.createElement("td");

        cell.style.padding = "12px";
        cell.style.borderBottom = "1px solid #e5e7eb";
        cell.textContent =
            value === null || value === undefined || value === ""
                ? "—"
                : String(value);

        return cell;
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleString();
    }

    function isActive(user) {
        return user.is_active === true ||
            user.is_active === 1 ||
            user.is_active === "1";
    }

    function isVerified(user) {
        return user.is_verified === true ||
            user.is_verified === 1 ||
            user.is_verified === "1";
    }

    function showTableMessage(tbody, text, columnCount) {
        tbody.replaceChildren();

        const row = document.createElement("tr");
        const cell = createCell(text);

        cell.colSpan = columnCount;
        row.appendChild(cell);
        tbody.appendChild(row);
    }

    function addButton(container, label, onClick, options = {}) {
        const button = createElement("button", label);

        button.type = "button";
        button.disabled = Boolean(options.disabled);
        button.addEventListener("click", onClick);

        container.appendChild(button);

        return button;
    }

    function showView(viewName) {
        if (!views[viewName]) {
            return;
        }

        Object.entries(views).forEach(([name, element]) => {
            if (element) {
                element.hidden = name !== viewName;
            }
        });

        document.querySelectorAll("[data-staff-view]").forEach((button) => {
            const selected = button.dataset.staffView === viewName;

            button.setAttribute("aria-pressed", String(selected));
        });

        const loaders = {
            users: loadUsers,
            roles: loadRoles,
            permissions: loadPermissions,
            departments: loadDepartments,
            audit: loadAuditLogs
        };

        showMessage(`Loading ${viewName}...`);

        if (loaders[viewName]) {
            loaders[viewName]();
        }
    }

    /*
     * OVERVIEW
     */

    async function loadOverview() {
        try {
            const data = await apiRequest("/overview");
            const overview = data.overview || {};

            $("#staffTotalAccounts").textContent =
                overview.totalUsers ??
                overview.totalAccounts ??
                overview.total_users ??
                overview.total_accounts ??
                "—";

            $("#staffActiveAccounts").textContent =
                overview.activeUsers ??
                overview.activeAccounts ??
                overview.active_users ??
                overview.active_accounts ??
                "—";

            $("#staffTotalRoles").textContent =
                overview.totalRoles ??
                overview.total_roles ??
                "—";

            $("#staffTotalDepartments").textContent =
                overview.totalDepartments ??
                overview.total_departments ??
                "—";

            showMessage("Staff management overview loaded.");
        } catch (error) {
            showMessage(error.message, true);
        }
    }

    /*
     * USERS AND STAFF
     */

    async function loadUsers() {
        const tbody = $("#staffUsersTableBody");

        showTableMessage(tbody, "Loading accounts...", 8);

        try {
            const data = await apiRequest("/users");

            state.users = Array.isArray(data.users) ? data.users : [];

            tbody.replaceChildren();

            if (state.users.length === 0) {
                showTableMessage(tbody, "No accounts found.", 8);
                showMessage("No accounts were found.");
                return;
            }

            state.users.forEach((user) => {
                const row = document.createElement("tr");

                row.appendChild(createCell(user.id));
                row.appendChild(createCell(user.username));
                row.appendChild(createCell(user.email));
                row.appendChild(createCell(user.role));
                row.appendChild(
                    createCell(isVerified(user) ? "Verified" : "Unverified")
                );
                row.appendChild(
                    createCell(isActive(user) ? "Active" : "Inactive")
                );
                row.appendChild(createCell(formatDate(user.created_at)));

                const actions = document.createElement("td");
                actions.style.padding = "12px";
                actions.style.borderBottom = "1px solid #e5e7eb";

                const toggleButton = addButton(
                    actions,
                    isActive(user) ? "Deactivate" : "Activate",
                    () => changeUserStatus(user),
                    {
                        disabled: Number(user.id) ===
                            Number(window.currentUserId)
                    }
                );

                toggleButton.style.marginRight = "8px";

                addButton(actions, "Change Role", () => changeUserRole(user));

                row.appendChild(actions);
                tbody.appendChild(row);
            });

            showMessage(`${state.users.length} account(s) loaded.`);
        } catch (error) {
            showTableMessage(tbody, error.message, 8);
            showMessage(error.message, true);
        }
    }

    async function changeUserStatus(user) {
        const currentlyActive = isActive(user);

        const action = currentlyActive ? "deactivate" : "activate";

        if (
            !window.confirm(
                `Are you sure you want to ${action} the account "${user.username}"?`
            )
        ) {
            return;
        }

        try {
            await apiRequest(
                `/users/${encodeURIComponent(user.id)}/status`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        is_active: currentlyActive ? 0 : 1
                    })
                }
            );

            showMessage(`Account ${action} request completed.`);
            await Promise.all([loadUsers(), loadOverview()]);
        } catch (error) {
            showMessage(error.message, true);
        }
    }

    async function changeUserRole(user) {
        if (!state.roles.length) {
            try {
                const data = await apiRequest("/roles");

                state.roles = Array.isArray(data.roles) ? data.roles : [];
            } catch (error) {
                showMessage(error.message, true);
                return;
            }
        }

        const availableRoles = state.roles
            .map((role) => role.slug)
            .filter(Boolean);

        if (!availableRoles.length) {
            showMessage("No available roles were returned by the server.", true);
            return;
        }

        const selectedRole = window.prompt(
            `Change the role for ${user.username}.\n\nAvailable roles:\n` +
            availableRoles.join("\n") +
            "\n\nEnter the exact role slug:"
        );

        if (selectedRole === null) {
            return;
        }

        const role = selectedRole.trim();

        if (!availableRoles.includes(role)) {
            showMessage("That role does not exist. No changes were made.", true);
            return;
        }

        if (
            !window.confirm(
                `Change ${user.username}'s role to "${role}"?`
            )
        ) {
            return;
        }

        try {
            await apiRequest(
                `/users/${encodeURIComponent(user.id)}/role`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ role })
                }
            );

            showMessage("Account role updated.");
            await Promise.all([loadUsers(), loadOverview()]);
        } catch (error) {
            showMessage(error.message, true);
        }
    }

    /*
     * ROLES
     */

    async function loadRoles() {
        const container = $("#staffRolesResults");

        container.textContent = "Loading roles...";

        try {
            const data = await apiRequest("/roles");

            state.roles = Array.isArray(data.roles) ? data.roles : [];

            container.replaceChildren();

            if (!state.roles.length) {
                container.textContent = "No roles found.";
                showMessage("No roles were returned.");
                return;
            }

            const list = document.createElement("div");

            state.roles.forEach((role) => {
                const article = document.createElement("article");

                article.style.padding = "14px";
                article.style.marginBottom = "10px";
                article.style.border = "1px solid #ddd";
                article.style.borderRadius = "8px";

                article.appendChild(
                    createElement("h4", role.name || role.slug || "Role")
                );

                article.appendChild(
                    createElement("p", `Role ID: ${role.id ?? "—"}`)
                );

                article.appendChild(
                    createElement("p", `Slug: ${role.slug ?? "—"}`)
                );

                article.appendChild(
                    createElement(
                        "p",
                        role.description || "No description provided."
                    )
                );

                list.appendChild(article);
            });

            container.appendChild(list);
            showMessage(`${state.roles.length} role(s) loaded.`);
        } catch (error) {
            container.textContent = error.message;
            showMessage(error.message, true);
        }
    }

    /*
     * PERMISSIONS
     */

    async function loadPermissions() {
        const container = $("#staffPermissionsResults");

        container.textContent = "Loading permissions...";

        try {
            const data = await apiRequest("/permissions");

            state.permissions = Array.isArray(data.permissions)
                ? data.permissions
                : [];

            container.replaceChildren();

            if (!state.permissions.length) {
                container.textContent = "No permissions found.";
                showMessage("No permissions were returned.");
                return;
            }

            const list = document.createElement("div");

            state.permissions.forEach((permission) => {
                const article = document.createElement("article");

                article.style.padding = "12px";
                article.style.marginBottom = "8px";
                article.style.border = "1px solid #ddd";
                article.style.borderRadius = "8px";

                article.appendChild(
                    createElement(
                        "strong",
                        permission.name ||
                        permission.permission_key ||
                        "Permission"
                    )
                );

                article.appendChild(
                    createElement(
                        "p",
                        `Key: ${permission.permission_key ?? "—"}`
                    )
                );

                article.appendChild(
                    createElement(
                        "p",
                        `Category: ${permission.category ?? "—"}`
                    )
                );

                if (permission.description) {
                    article.appendChild(
                        createElement("p", permission.description)
                    );
                }

                list.appendChild(article);
            });

            container.appendChild(list);

            showMessage(`${state.permissions.length} permission(s) loaded.`);
        } catch (error) {
            container.textContent = error.message;
            showMessage(error.message, true);
        }
    }

    /*
     * DEPARTMENTS
     */

    async function loadDepartments() {
        const container = $("#staffDepartmentsResults");

        container.textContent = "Loading departments...";

        try {
            const data = await apiRequest("/departments");
            const departments = Array.isArray(data.departments)
                ? data.departments
                : [];

            container.replaceChildren();

            if (!departments.length) {
                container.textContent = "No departments found.";
                showMessage("No departments were returned.");
                return;
            }

            departments.forEach((department) => {
                const article = document.createElement("article");

                article.style.padding = "14px";
                article.style.marginBottom = "10px";
                article.style.border = "1px solid #ddd";
                article.style.borderRadius = "8px";

                article.appendChild(
                    createElement("h4", department.name || "Department")
                );

                article.appendChild(
                    createElement(
                        "p",
                        department.description || "No description provided."
                    )
                );

                article.appendChild(
                    createElement(
                        "p",
                        `Status: ${
                            department.is_active === false ||
                            department.is_active === 0
                                ? "Inactive"
                                : "Active"
                        }`
                    )
                );

                container.appendChild(article);
            });

            showMessage(`${departments.length} department(s) loaded.`);
        } catch (error) {
            container.textContent = error.message;
            showMessage(error.message, true);
        }
    }

    async function createDepartment(event) {
        event.preventDefault();

        const nameInput = $("#staffDepartmentName");
        const descriptionInput = $("#staffDepartmentDescription");

        const name = nameInput.value.trim();
        const description = descriptionInput.value.trim();

        if (!name) {
            showMessage("Enter a department name.", true);
            nameInput.focus();
            return;
        }

        const submitButton = event.submitter;

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            await apiRequest("/departments", {
                method: "POST",
                body: JSON.stringify({ name, description })
            });

            event.target.reset();

            showMessage("Department created successfully.");

            await Promise.all([loadDepartments(), loadOverview()]);
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    }

    /*
     * AUDIT LOGS
     */

    async function loadAuditLogs() {
        const container = $("#staffAuditResults");

        container.textContent = "Loading audit logs...";

        try {
            const data = await apiRequest("/audit-logs");

            const logs = Array.isArray(data.logs)
                ? data.logs
                : Array.isArray(data.auditLogs)
                    ? data.auditLogs
                    : Array.isArray(data.audit_logs)
                        ? data.audit_logs
                        : [];

            container.replaceChildren();

            if (!logs.length) {
                container.textContent = "No audit activity found.";
                showMessage("No audit activity was returned.");
                return;
            }

            const wrapper = document.createElement("div");
            wrapper.style.overflowX = "auto";

            const table = document.createElement("table");

            table.style.width = "100%";
            table.style.borderCollapse = "collapse";
            table.style.textAlign = "left";

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");

            ["Date", "Actor ID", "Action", "Target", "Details"].forEach(
                (heading) => {
                    const th = createElement("th", heading);

                    th.style.padding = "12px";
                    th.style.borderBottom = "2px solid #ddd";

                    headerRow.appendChild(th);
                }
            );

            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement("tbody");

            logs.forEach((log) => {
                const row = document.createElement("tr");

                row.appendChild(createCell(formatDate(log.created_at)));
                row.appendChild(createCell(log.actor_user_id));
                row.appendChild(createCell(log.action));

                row.appendChild(
                    createCell(
                        `${log.target_type || "—"} ${
                            log.target_id ?? ""
                        }`.trim()
                    )
                );

                row.appendChild(createCell(log.details));

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            wrapper.appendChild(table);
            container.appendChild(wrapper);

            showMessage(`${logs.length} audit record(s) loaded.`);
        } catch (error) {
            container.textContent = error.message;
            showMessage(error.message, true);
        }
    }
/*
 * CREATE USER AND STAFF ACCOUNTS
 */

function createAccountForm() {
    const panel = document.createElement("section");

    panel.id = "staffCreateAccountPanel";
    panel.style.cssText =
        "padding:20px;margin-bottom:20px;border:1px solid #ddd;border-radius:12px;";

    const heading = createElement("h3", "Create Account");
    const description = createElement(
        "p",
        "Create an account and assign its role. The user must verify their email before logging in."
    );

    const form = document.createElement("form");
    form.id = "staffCreateAccountForm";

    const fields = [
        {
            name: "username",
            label: "Username",
            type: "text",
            autocomplete: "username"
        },
        {
            name: "email",
            label: "Email address",
            type: "email",
            autocomplete: "email"
        },
        {
            name: "password",
            label: "Temporary password",
            type: "password",
            autocomplete: "new-password"
        }
    ];

    fields.forEach((field) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "margin-bottom:14px;";

        const label = createElement("label", field.label);
        label.htmlFor = `staffAccount_${field.name}`;
        label.style.cssText =
            "display:block;font-weight:600;margin-bottom:6px;";

        const input = document.createElement("input");
        input.id = `staffAccount_${field.name}`;
        input.name = field.name;
        input.type = field.type;
        input.autocomplete = field.autocomplete;
        input.required = true;

        if (field.name === "username") {
            input.minLength = 3;
        }

        if (field.name === "password") {
            input.minLength = 8;
            input.placeholder =
                "Uppercase, lowercase, number and symbol";
        }

        input.style.cssText =
            "box-sizing:border-box;width:100%;max-width:520px;padding:11px;border:1px solid #ccc;border-radius:7px;";

        wrapper.append(label, input);
        form.appendChild(wrapper);
    });

    const roleWrapper = document.createElement("div");
    roleWrapper.style.cssText = "margin-bottom:16px;";

    const roleLabel = createElement("label", "Account role");
    roleLabel.htmlFor = "staffAccount_role";
    roleLabel.style.cssText =
        "display:block;font-weight:600;margin-bottom:6px;";

    const roleSelect = document.createElement("select");
    roleSelect.id = "staffAccount_role";
    roleSelect.name = "role";
    roleSelect.required = true;
    roleSelect.style.cssText =
        "box-sizing:border-box;width:100%;max-width:520px;padding:11px;border:1px solid #ccc;border-radius:7px;";

    roleSelect.appendChild(
        new Option("Loading available roles...", "")
    );

    roleWrapper.append(roleLabel, roleSelect);
    form.appendChild(roleWrapper);

    const submit = createElement("button", "Create Account");
    submit.type = "submit";
    submit.style.cssText =
        "padding:11px 18px;border:0;border-radius:7px;cursor:pointer;font-weight:600;";

    form.appendChild(submit);

    panel.append(heading, description, form);

    const usersView = views.users;

    if (usersView) {
        usersView.prepend(panel);
    }

    async function populateRoles() {
        try {
            const data = await apiRequest("/roles");

            state.roles = Array.isArray(data.roles) ? data.roles : [];

            roleSelect.replaceChildren(
                new Option("Select a role", "")
            );

            state.roles.forEach((role) => {
                if (!role.slug) {
                    return;
                }

                roleSelect.appendChild(
                    new Option(
                        `${role.name || role.slug} (${role.slug})`,
                        role.slug
                    )
                );
            });
        } catch (error) {
            roleSelect.replaceChildren(
                new Option("Unable to load roles", "")
            );

            showMessage(error.message, true);
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const username = form.elements.username.value.trim();
        const email = form.elements.email.value.trim();
        const password = form.elements.password.value;
        const role = roleSelect.value;

        if (!role) {
            showMessage("Select an account role.", true);
            roleSelect.focus();
            return;
        }

        const confirmed = window.confirm(
            `Create an account for ${username} with the role "${role}"?`
        );

        if (!confirmed) {
            return;
        }

        submit.disabled = true;
        submit.textContent = "Creating account...";

        try {
            const result = await apiRequest("/users", {
                method: "POST",
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    role
                })
            });

            form.reset();

            showMessage(
                result.message || "Account created successfully."
            );

            await Promise.all([
                loadUsers(),
                loadOverview(),
                loadAuditLogs()
            ]);
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            submit.disabled = false;
            submit.textContent = "Create Account";
        }
    });

    populateRoles();
}
    /*
     * CONNECT BUTTONS
     */

    document.querySelectorAll("[data-staff-view]").forEach((button) => {
        button.addEventListener("click", () => {
            showView(button.dataset.staffView);
        });
    });

    $("#staffRefreshUsers")?.addEventListener("click", loadUsers);
    $("#staffRefreshRoles")?.addEventListener("click", loadRoles);
    $("#staffRefreshPermissions")?.addEventListener(
        "click",
        loadPermissions
    );
    $("#staffRefreshDepartments")?.addEventListener(
        "click",
        loadDepartments
    );
    $("#staffRefreshAudit")?.addEventListener("click", loadAuditLogs);

    $("#staffCreateDepartmentForm")?.addEventListener(
        "submit",
        createDepartment
    );
createAccountForm();
    /*
     * INITIAL LOAD
     */

    loadOverview();
    loadUsers();
})();