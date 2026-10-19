"use strict";

/*
 * YASU Tech — Dashboard Notifications
 *
 * Retrieves real website contact messages through the
 * existing authenticated API. This script does not
 * modify messages or change their read status.
 */

(function () {
    const notificationButton = document.getElementById(
        "adminNotificationsButton"
    );

    if (!notificationButton) {
        console.warn(
            "YASU Tech: Notification button was not found."
        );
        return;
    }

    // Create the dropdown without changing the existing HTML.
    const notificationPanel = document.createElement("section");

    notificationPanel.id = "adminNotificationsPanel";
    notificationPanel.className = "admin-notifications-panel";
    notificationPanel.hidden = true;

    notificationPanel.setAttribute(
        "aria-label",
        "Website contact messages"
    );

    notificationPanel.innerHTML = `
        <div class="admin-notifications-heading">
            <div>
                <strong>Notifications</strong>
                <p>Recent website messages</p>
            </div>

            <button
                type="button"
                class="admin-notifications-refresh"
                id="adminNotificationsRefresh"
            >
                Refresh
            </button>
        </div>

        <div
            class="admin-notifications-status"
            id="adminNotificationsStatus"
            role="status"
            aria-live="polite"
        >
            Click the bell to load messages.
        </div>

        <div
            class="admin-notifications-list"
            id="adminNotificationsList"
        ></div>
    `;

    notificationButton.insertAdjacentElement(
        "afterend",
        notificationPanel
    );

    // A count of messages, not an unread-message count.
    const countBadge = document.createElement("span");

    countBadge.id = "adminNotificationsCount";
    countBadge.className = "admin-notifications-count";
    countBadge.hidden = true;
    countBadge.setAttribute("aria-label", "Total messages");

    notificationButton.appendChild(countBadge);

    const statusElement = notificationPanel.querySelector(
        "#adminNotificationsStatus"
    );

    const listElement = notificationPanel.querySelector(
        "#adminNotificationsList"
    );

    const refreshButton = notificationPanel.querySelector(
        "#adminNotificationsRefresh"
    );

    let isLoading = false;
    let hasLoaded = false;

    function getToken() {
        const storageSources = [
            window.localStorage,
            window.sessionStorage
        ];

        for (const storage of storageSources) {
            try {
                const token = storage.getItem("userToken");

                if (token) {
                    return token;
                }
            } catch (error) {
                // Continue to the other storage source.
            }
        }

        return null;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(
            /[&<>"']/g,
            function (character) {
                const replacements = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                };

                return replacements[character];
            }
        );
    }

    function formatDate(value) {
        if (!value) {
            return "Date unavailable";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString();
    }

    function updateCount(count) {
        countBadge.textContent =
            count > 99 ? "99+" : String(count);

        countBadge.hidden = count === 0;

        notificationButton.setAttribute(
            "aria-label",
            count > 0
                ? `Notifications: ${count} contact messages`
                : "Notifications"
        );
    }

    function showError(message) {
        statusElement.textContent = message;
        statusElement.hidden = false;
        listElement.replaceChildren();
    }

    function renderMessages(messages) {
        listElement.replaceChildren();

        if (messages.length === 0) {
            statusElement.textContent =
                "No website contact messages yet.";

            return;
        }

        statusElement.textContent =
            `${messages.length} contact message(s) retrieved.`;

        messages.slice(0, 10).forEach(function (message) {
            const item = document.createElement("article");

            item.className = "admin-notification-item";

            const sender = escapeHtml(
                message.name || "Website visitor"
            );

            const subject = escapeHtml(
                message.subject || "No subject"
            );

            const date = escapeHtml(
                formatDate(message.created_at)
            );

            item.innerHTML = `
                <strong class="admin-notification-sender">
                    ${sender}
                </strong>

                <div class="admin-notification-subject">
                    ${subject}
                </div>

                <time class="admin-notification-date">
                    ${date}
                </time>
            `;

            listElement.appendChild(item);
        });

        if (messages.length > 10) {
            const note = document.createElement("p");

            note.className = "admin-notifications-note";

            note.textContent =
                "Showing the 10 most recent messages.";

            listElement.appendChild(note);
        }
    }

    async function loadNotifications() {
        if (isLoading) {
            return;
        }

        const token = getToken();

        if (!token) {
            showError(
                "Your login session could not be found. Please sign in again."
            );

            return;
        }

        isLoading = true;
        refreshButton.disabled = true;

        statusElement.textContent = "Loading messages…";
        listElement.replaceChildren();

        try {
            const response = await fetch("/api/contact", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (response.status === 401 ||
                response.status === 403) {
                throw new Error(
                    "Access denied. Please sign in again with an administrator account."
                );
            }

            if (!response.ok) {
                throw new Error(
                    "Unable to retrieve website messages. Please try again."
                );
            }

            const messages = await response.json();

            if (!Array.isArray(messages)) {
                throw new Error(
                    "The server returned an unexpected response."
                );
            }

            updateCount(messages.length);
            renderMessages(messages);
            hasLoaded = true;
        } catch (error) {
            showError(
                error.message ||
                "An error occurred while loading notifications."
            );
        } finally {
            isLoading = false;
            refreshButton.disabled = false;
        }
    }

    function setPanelOpen(open) {
        notificationPanel.hidden = !open;

        notificationButton.setAttribute(
            "aria-expanded",
            String(open)
        );

        if (open && !hasLoaded) {
            loadNotifications();
        }
    }

    notificationButton.setAttribute(
        "aria-expanded",
        "false"
    );

    notificationButton.setAttribute(
        "aria-controls",
        "adminNotificationsPanel"
    );

    notificationButton.addEventListener("click", function () {
        setPanelOpen(notificationPanel.hidden);
    });

    refreshButton.addEventListener(
        "click",
        loadNotifications
    );

    document.addEventListener("click", function (event) {
        if (
            !notificationButton.contains(event.target) &&
            !notificationPanel.contains(event.target)
        ) {
            setPanelOpen(false);
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            setPanelOpen(false);
        }
    });
})();