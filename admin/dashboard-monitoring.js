"use strict";

/* YASU TECH — CONTENT ANALYTICS AND WEBSITE MONITORING */

(function () {
    const categories = [
        { key: "documents", label: "Documents", color: "#3568d4" },
        { key: "speeches", label: "Speeches", color: "#16a085" },
        { key: "presentations", label: "Presentations", color: "#e6a23c" },
        { key: "writings", label: "Writings", color: "#8e63ce" }
    ];

    function getToken() {
        return (
            sessionStorage.getItem("userToken") ||
            localStorage.getItem("userToken") ||
            sessionStorage.getItem("token") ||
            localStorage.getItem("token")
        );
    }

    async function fetchJSON(url) {
        const token = getToken();

        if (!token) {
            throw new Error("No authentication token found.");
        }

        const response = await fetch(url, {
            headers: {
                Authorization: "Bearer " + token
            }
        });

        if (!response.ok) {
            throw new Error(
                "Request failed: " + url + " (HTTP " + response.status + ")"
            );
        }

        return response.json();
    }

    function getContainer(id) {
        return document.getElementById(id);
    }

    function showMessage(container, message) {
        if (!container) return;

        const paragraph = document.createElement("p");
        paragraph.className = "yasu-analytics-message";
        paragraph.textContent = message;

        container.replaceChildren(paragraph);
    }

    function renderAnalytics(stats) {
        const container = getContainer("yasuContentPerformance");

        if (!container) {
            console.warn(
                "YASU Tech: Content Analytics container was not found."
            );
            return;
        }

        const values = categories.map(function (category) {
            const value = Number(stats[category.key]);

            return {
                ...category,
                value: Number.isFinite(value) && value > 0 ? value : 0
            };
        });

        const total = values.reduce(function (sum, item) {
            return sum + item.value;
        }, 0);

        const section = document.createElement("div");
        section.className = "yasu-live-analytics";

        if (total === 0) {
            showMessage(
                container,
                "No content has been recorded in these categories yet."
            );
            return;
        }

        const chartLayout = document.createElement("div");
        chartLayout.className = "yasu-analytics-chart";

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");

        svg.setAttribute("viewBox", "0 0 180 180");
        svg.setAttribute("role", "img");
        svg.setAttribute(
            "aria-label",
            "Content category distribution: " +
                values.map(function (item) {
                    const percentage = (item.value / total) * 100;
                    return (
                        item.label +
                        " " +
                        item.value +
                        ", " +
                        percentage.toFixed(1) +
                        " percent"
                    );
                }).join("; ")
        );
        svg.classList.add("yasu-donut-chart");

        const track = document.createElementNS(svgNS, "circle");
        track.setAttribute("cx", "90");
        track.setAttribute("cy", "90");
        track.setAttribute("r", "64");
        track.classList.add("yasu-donut-track");
        svg.appendChild(track);

        const circumference = 2 * Math.PI * 64;
        let offset = 0;

        values.forEach(function (item) {
            if (item.value === 0) return;

            const segment = document.createElementNS(svgNS, "circle");

            segment.setAttribute("cx", "90");
            segment.setAttribute("cy", "90");
            segment.setAttribute("r", "64");
            segment.setAttribute("stroke", item.color);
            segment.setAttribute(
                "stroke-dasharray",
                (item.value / total) * circumference +
                    " " +
                    circumference
            );
            segment.setAttribute("stroke-dashoffset", String(-offset));
            segment.classList.add("yasu-donut-segment");

            svg.appendChild(segment);

            offset += (item.value / total) * circumference;
        });

        const totalText = document.createElementNS(svgNS, "text");
        totalText.setAttribute("x", "90");
        totalText.setAttribute("y", "86");
        totalText.classList.add("yasu-analytics-total");
        totalText.textContent = total.toLocaleString();
        svg.appendChild(totalText);

        const labelText = document.createElementNS(svgNS, "text");
        labelText.setAttribute("x", "90");
        labelText.setAttribute("y", "105");
        labelText.classList.add("yasu-analytics-total-label");
        labelText.textContent = "Total content";
        svg.appendChild(labelText);

        chartLayout.appendChild(svg);

        const legend = document.createElement("div");
        legend.className = "yasu-analytics-legend";

        values.forEach(function (item) {
            const percentage =
                total > 0 ? (item.value / total) * 100 : 0;

            const row = document.createElement("div");
            row.className = "yasu-analytics-legend-item";

            const dot = document.createElement("span");
            dot.className = "yasu-analytics-dot";
            dot.style.backgroundColor = item.color;

            const details = document.createElement("div");
            details.appendChild(document.createTextNode(item.label));

            const number = document.createElement("strong");
            number.textContent =
                item.value.toLocaleString() +
                " · " +
                percentage.toFixed(1) +
                "%";

            details.appendChild(number);
            row.append(dot, details);
            legend.appendChild(row);
        });

        chartLayout.appendChild(legend);
        section.appendChild(chartLayout);
        container.replaceChildren(section);
    }

    function formatDate(value) {
        if (!value) return "Date not recorded";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Date not recorded";
        }

        return date.toLocaleString();
    }

    function extractArray(result, possibleKeys) {
        if (Array.isArray(result)) return result;

        if (!result || typeof result !== "object") return [];

        for (const key of possibleKeys) {
            if (Array.isArray(result[key])) {
                return result[key];
            }
        }

        return [];
    }

    function parseDetails(details) {
        if (details && typeof details === "object") {
            return details;
        }

        if (typeof details === "string") {
            try {
                return JSON.parse(details);
            } catch {
                return {};
            }
        }

        return {};
    }

    function prettifyAction(action) {
        if (!action) return "Administrative activity";

        return String(action)
            .replace(/[._-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/\b\w/g, function (letter) {
                return letter.toUpperCase();
            });
    }

    async function collectActivities() {
        const requests = await Promise.allSettled([
            fetchJSON("/api/content/admin/all"),
            fetchJSON("/api/pages"),
            fetchJSON("/api/staff-management/audit-logs")
        ]);

        const activities = [];

        const contentResult = requests[0];
        const pagesResult = requests[1];
        const auditResult = requests[2];

        if (contentResult.status === "fulfilled") {
            const contentItems = extractArray(contentResult.value, [
                "content",
                "items",
                "data"
            ]);

            contentItems.forEach(function (item) {
                const date =
                    item.updated_at ||
                    item.created_at ||
                    item.uploaded_at;

                if (!date) return;

                activities.push({
                    title: "Content record",
                    description:
                        item.title ||
                        item.name ||
                        item.filename ||
                        "Content record updated",
                    date: date
                });
            });
        } else {
            console.warn(
                "YASU Tech: Content activity could not be loaded.",
                contentResult.reason
            );
        }

        if (pagesResult.status === "fulfilled") {
            const pages = extractArray(pagesResult.value, [
                "pages",
                "items",
                "data"
            ]);

            pages.forEach(function (page) {
                const date = page.updated_at || page.created_at;

                if (!date) return;

                activities.push({
                    title: "Website page record",
                    description:
                        page.title ||
                        page.page_key ||
                        "Website page record",
                    date: date
                });
            });
        } else {
            console.warn(
                "YASU Tech: Page activity could not be loaded.",
                pagesResult.reason
            );
        }

        if (auditResult.status === "fulfilled") {
            const logs = extractArray(auditResult.value, [
                "logs",
                "items",
                "data"
            ]);

            logs.forEach(function (log) {
                const date = log.created_at;

                if (!date) return;

                const details = parseDetails(log.details);
                const target = [
                    details.title,
                    details.name,
                    details.username,
                    details.email
                ].find(function (value) {
                    return typeof value === "string" && value.trim();
                });

                activities.push({
                    title: prettifyAction(log.action),
                    description:
                        (log.target_type
                            ? String(log.target_type).replace(/_/g, " ")
                            : "Administrative record") +
                        (target ? ": " + target : ""),
                    date: date
                });
            });
        } else {
            console.warn(
                "YASU Tech: Administrative activity could not be loaded.",
                auditResult.reason
            );
        }

        return activities
            .filter(function (item) {
                return !Number.isNaN(new Date(item.date).getTime());
            })
            .sort(function (a, b) {
                return new Date(b.date) - new Date(a.date);
            })
            .slice(0, 8);
    }

    function renderActivities(activities) {
        const container = getContainer("yasuRecentActivity");

        if (!container) {
            console.warn(
                "YASU Tech: Website Monitoring container was not found."
            );
            return;
        }

        if (activities.length === 0) {
            showMessage(
                container,
                "No recent activity records are available from the connected sources."
            );
            return;
        }

        const list = document.createElement("div");
        list.className = "yasu-activity-list";

        activities.forEach(function (activity) {
            const row = document.createElement("article");
            row.className = "yasu-activity-item";

            const dot = document.createElement("span");
            dot.className = "yasu-activity-dot";
            dot.setAttribute("aria-hidden", "true");

            const body = document.createElement("div");

            const title = document.createElement("strong");
            title.textContent = activity.title;

            const description = document.createElement("p");
            description.textContent = activity.description;

            const time = document.createElement("time");
            time.textContent = formatDate(activity.date);
            time.setAttribute("datetime", activity.date);

            body.append(title, description, time);
            row.append(dot, body);
            list.appendChild(row);
        });

        container.replaceChildren(list);
    }

    async function initializeMonitoring() {
        const analyticsContainer = getContainer("yasuContentPerformance");
        const activityContainer = getContainer("yasuRecentActivity");

        if (analyticsContainer) {
            showMessage(analyticsContainer, "Loading content analytics…");
        }

        if (activityContainer) {
            showMessage(activityContainer, "Loading recent activity…");
        }

        try {
            const result = await fetchJSON("/api/admin/stats");

            if (!result.success || !result.stats) {
                throw new Error("Invalid statistics response.");
            }

            renderAnalytics(result.stats);
        } catch (error) {
            console.error(
                "YASU Tech: Unable to load Content Analytics.",
                error
            );

            showMessage(
                analyticsContainer,
                "Content Analytics could not be loaded. Check your login and permissions."
            );
        }

        try {
            const activities = await collectActivities();
            renderActivities(activities);
        } catch (error) {
            console.error(
                "YASU Tech: Unable to load Website Monitoring.",
                error
            );

            showMessage(
                activityContainer,
                "Website Monitoring could not be loaded."
            );
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeMonitoring,
            { once: true }
        );
    } else {
        initializeMonitoring();
    }
})();