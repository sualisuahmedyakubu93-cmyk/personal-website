"use strict";

/*
 * =========================================================
 * YASU TECH — GLOBAL ADMIN DASHBOARD SEARCH
 * =========================================================
 *
 * Features:
 * 1. Searches uploaded content.
 * 2. Searches display controls.
 * 3. Searches website page editing forms.
 * 4. Searches other readable dashboard content.
 * 5. Searches text entered in form fields.
 * 6. Counts results and repeated occurrences.
 * 7. Highlights matches in the search results.
 * 8. Navigates to matching dashboard items.
 * 9. Supports dynamically loaded dashboard content.
 *
 * This file does not save, edit, delete, or modify content.
 * =========================================================
 */

(function () {
    if (window.__yasuGlobalSearchInitialized) {
        return;
    }

    window.__yasuGlobalSearchInitialized = true;

    const searchForm = document.getElementById(
        "adminTopbarSearchForm"
    );

    const searchInput = document.getElementById(
        "adminTopbarSearch"
    );

    const dashboard = document.getElementById(
        "dashboard-top"
    );

    if (!searchForm || !searchInput || !dashboard) {
        console.warn(
            "YASU Tech: Global search could not find the required dashboard elements."
        );

        window.__yasuGlobalSearchInitialized = false;
        return;
    }

    /*
     * Create a separate search-results panel.
     * Original dashboard content is never replaced.
     */

    const resultsPanel = document.createElement("section");

    resultsPanel.className = "admin-global-search-results";

    resultsPanel.id = "adminGlobalSearchResults";

    resultsPanel.hidden = true;

    resultsPanel.setAttribute("aria-label", "Dashboard search results");

    resultsPanel.setAttribute("aria-live", "polite");

    searchForm.insertAdjacentElement("afterend", resultsPanel);

    let activeQuery = "";

    let searchTimer = null;

    let observerTimer = null;

    /*
     * Escape text before placing it inside HTML.
     * This keeps search terms from being interpreted as HTML.
     */

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            const replacements = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return replacements[character];
        });
    }

    /*
     * Count every non-overlapping occurrence of a search term.
     */

    function countOccurrences(text, query) {
        if (!query || !text) {
            return 0;
        }

        let count = 0;
        let position = 0;

        const normalizedText = text.toLocaleLowerCase();

        const normalizedQuery = query.toLocaleLowerCase();

        while (true) {
            const foundAt = normalizedText.indexOf(
                normalizedQuery,
                position
            );

            if (foundAt === -1) {
                break;
            }

            count++;

            position = foundAt + normalizedQuery.length;
        }

        return count;
    }

    /*
     * Highlight all occurrences in a result snippet.
     */

    function highlightText(text, query) {
        const safeText = String(text);

        if (!query) {
            return escapeHTML(safeText);
        }

        const lowerText = safeText.toLocaleLowerCase();

        const lowerQuery = query.toLocaleLowerCase();

        let output = "";

        let cursor = 0;

        while (true) {
            const matchIndex = lowerText.indexOf(
                lowerQuery,
                cursor
            );

            if (matchIndex === -1) {
                output += escapeHTML(
                    safeText.slice(cursor)
                );

                break;
            }

            output += escapeHTML(
                safeText.slice(cursor, matchIndex)
            );

            output +=
                "<mark>" +
                escapeHTML(
                    safeText.slice(
                        matchIndex,
                        matchIndex + query.length
                    )
                ) +
                "</mark>";

            cursor = matchIndex + query.length;
        }

        return output;
    }

    /*
     * Read text from an element, including current form values.
     */

    function getElementText(element) {
        const parts = [];

        if (element.innerText) {
            parts.push(element.innerText);
        } else if (element.textContent) {
            parts.push(element.textContent);
        }

        const controls = element.querySelectorAll(
            "input, textarea, select"
        );

        controls.forEach(function (control) {
            if (
                control.type === "hidden" ||
                control.type === "password" ||
                control.type === "file"
            ) {
                return;
            }

            if (
                control.type === "checkbox" ||
                control.type === "radio"
            ) {
                if (control.checked) {
                    parts.push(control.value);
                }

                return;
            }

            if (control.tagName === "SELECT") {
                const selectedOption =
                    control.options[control.selectedIndex];

                if (selectedOption) {
                    parts.push(selectedOption.textContent);
                }

                return;
            }

            if (control.value) {
                parts.push(control.value);
            }

            if (control.placeholder) {
                parts.push(control.placeholder);
            }

            if (control.getAttribute("aria-label")) {
                parts.push(
                    control.getAttribute("aria-label")
                );
            }
        });

        return Array.from(
            new Set(
                parts
                    .map(function (part) {
                        return String(part).trim();
                    })
                    .filter(Boolean)
            )
        ).join("\n");
    }

    /*
     * Find a useful title for a dashboard result.
     */

    function getElementTitle(element) {
        const titleInput = element.querySelector(
            ".website-page-title"
        );

        if (titleInput && titleInput.value.trim()) {
            return titleInput.value.trim();
        }

        const heading = element.querySelector(
            "h1, h2, h3, h4, h5, h6"
        );

        if (heading && heading.textContent.trim()) {
            return heading.textContent.trim();
        }

        const section = element.closest("section");

        if (section) {
            const sectionHeading = section.querySelector(
                "h1, h2, h3, h4, h5, h6"
            );

            if (
                sectionHeading &&
                sectionHeading.textContent.trim()
            ) {
                return sectionHeading.textContent.trim();
            }
        }

        return "Dashboard content";
    }

    /*
     * Get a section name for context.
     */

    function getSectionName(element) {
        const section = element.closest("section");

        if (!section) {
            return "Dashboard";
        }

        if (section.id === "displayControlsSection") {
            return "Display Controls";
        }

        if (section.id === "websitePagesSection") {
            return "Website Pages";
        }

        if (section.querySelector("#contentList")) {
            return "Uploaded Content";
        }

        const heading = section.querySelector(
            "h1, h2, h3, h4"
        );

        return heading
            ? heading.textContent.trim()
            : "Dashboard";
    }

    /*
     * Return true for elements that should not be searched.
     */

    function isExcluded(element) {
        if (!element || !element.isConnected) {
            return true;
        }

        if (element === resultsPanel) {
            return true;
        }

        if (
            element.closest(
                "#adminTopbarSearchForm, " +
                "#adminGlobalSearchResults, " +
                "#adminProfileMenu, " +
                ".admin-sidebar, " +
                "nav, script, style, noscript"
            )
        ) {
            return true;
        }

        if (element.closest("[hidden]")) {
            return true;
        }

        return false;
    }

    /*
     * Collect distinct searchable dashboard items.
     */

    function collectSearchableItems() {
        const items = [];

        const seen = new Set();

        function addItem(element, category) {
            if (
                !element ||
                seen.has(element) ||
                isExcluded(element)
            ) {
                return;
            }

            const text = getElementText(element);

            if (!text.trim()) {
                return;
            }

            seen.add(element);

            items.push({
                element: element,
                category: category || getSectionName(element),
                title: getElementTitle(element),
                text: text
            });
        }

        /*
         * Uploaded content cards.
         */

        const contentList = document.getElementById(
            "contentList"
        );

        if (contentList) {
            Array.from(contentList.children).forEach(
                function (element) {
                    if (
                        element.querySelector("h3") &&
                        !element.hasAttribute(
                            "data-admin-search-empty"
                        )
                    ) {
                        addItem(element, "Uploaded Content");
                    }
                }
            );
        }

        /*
         * Display control cards.
         */

        document.querySelectorAll(
            "#displayControlsList .display-control-card"
        ).forEach(function (element) {
            addItem(element, "Display Controls");
        });

        /*
         * Website page editing forms.
         */

        document.querySelectorAll(
            "#websitePagesSection .website-page-content-item, " +
            "#websitePagesSection .website-page-form"
        ).forEach(function (element) {
            addItem(element, "Website Page Editor");
        });

        /*
         * Website page cards that contain no separate editor forms.
         * This captures headings and descriptions belonging to a page.
         */

        document.querySelectorAll(
            "#websitePagesSection .website-page-card"
        ).forEach(function (element) {
            const hasEditor = element.querySelector(
                ".website-page-content-item, .website-page-form"
            );

            if (!hasEditor) {
                addItem(element, "Website Pages");
            }
        });

        /*
         * Search other readable text in the dashboard.
         * Skip elements already covered by larger content records.
         */

        const generalSelectors = [
            "main h1",
            "main h2",
            "main h3",
            "main h4",
            "main h5",
            "main h6",
            "main p",
            "main li",
            "main label",
            "main td",
            "main th",
            "main summary",
            "main .dashboard-card",
            "main .stat-card",
            "main .admin-card"
        ];

        document.querySelectorAll(
            generalSelectors.join(", ")
        ).forEach(function (element) {
            if (
                element.closest(
                    "#contentList, " +
                    "#displayControlsList, " +
                    "#websitePagesSection"
                )
            ) {
                return;
            }

            if (
                element.closest(
                    ".display-control-card, " +
                    ".website-page-content-item, " +
                    ".website-page-form"
                )
            ) {
                return;
            }

            if (
                element.closest(
                    "#adminTopbarSearchForm, " +
                    "#adminGlobalSearchResults"
                )
            ) {
                return;
            }

            addItem(element);
        });

        /*
         * Include standalone editable fields elsewhere in the main area.
         * Sensitive password fields and file inputs are excluded.
         */

        document.querySelectorAll(
            "main input:not([type='hidden']):not([type='password']):not([type='file']), " +
            "main textarea, main select"
        ).forEach(function (control) {
            if (isExcluded(control)) {
                return;
            }

            if (
                control.closest(
                    "#contentList, " +
                    "#displayControlsList, " +
                    "#websitePagesSection, " +
                    ".display-control-card"
                )
            ) {
                return;
            }

            const form = control.closest("form");

            if (form) {
                addItem(form);
            } else {
                addItem(control);
            }
        });

        return items;
    }

    /*
     * Find a short, useful excerpt around the first match.
     */

    function getSnippet(text, query) {
        const normalizedText = text.replace(/\s+/g, " ").trim();

        const position = normalizedText
            .toLocaleLowerCase()
            .indexOf(query.toLocaleLowerCase());

        if (position === -1) {
            return normalizedText.slice(0, 180);
        }

        const start = Math.max(0, position - 65);

        const end = Math.min(
            normalizedText.length,
            position + query.length + 100
        );

        let snippet = normalizedText.slice(start, end);

        if (start > 0) {
            snippet = "…" + snippet;
        }

        if (end < normalizedText.length) {
            snippet += "…";
        }

        return snippet;
    }

    /*
     * Scroll to a result and briefly outline its dashboard item.
     */

    function navigateToResult(element) {
        if (!element || !element.isConnected) {
            return;
        }

        const target =
            element.closest(".website-page-content-item") ||
            element.closest(".website-page-form") ||
            element.closest(".display-control-card") ||
            element;

        target.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        target.classList.remove(
            "admin-global-search-target"
        );

        void target.offsetWidth;

        target.classList.add(
            "admin-global-search-target"
        );

        window.setTimeout(function () {
            target.classList.remove(
                "admin-global-search-target"
            );
        }, 2500);

        const field = target.querySelector(
            "input:not([type='hidden']):not([type='password']):not([type='file']), " +
            "textarea, select"
        );

        if (field && typeof field.focus === "function") {
            window.setTimeout(function () {
                field.focus({
                    preventScroll: true
                });
            }, 250);
        }
    }

    /*
     * Close the search results.
     */

    function closeResults() {
        resultsPanel.hidden = true;
        resultsPanel.replaceChildren();
    }

    /*
     * Render search results in the separate results panel.
     */

    function renderResults(query) {
        resultsPanel.replaceChildren();

        if (!query) {
            closeResults();
            return;
        }

        const items = collectSearchableItems();

        const matches = [];

        let totalOccurrences = 0;

        items.forEach(function (item) {
            const occurrences = countOccurrences(
                item.text,
                query
            );

            if (occurrences > 0) {
                matches.push({
                    item: item,
                    occurrences: occurrences
                });

                totalOccurrences += occurrences;
            }
        });

        resultsPanel.hidden = false;

        const summary = document.createElement("div");

        summary.className = "admin-global-search-summary";

        summary.textContent =
            matches.length +
            (matches.length === 1 ? " result" : " results") +
            " • " +
            totalOccurrences +
            (totalOccurrences === 1
                ? " matching occurrence"
                : " matching occurrences");

        resultsPanel.appendChild(summary);

        if (matches.length === 0) {
            const empty = document.createElement("p");

            empty.className = "admin-global-search-empty";

            empty.textContent =
                'No results found for "' + query + '".';

            resultsPanel.appendChild(empty);

            return;
        }

        const fragment = document.createDocumentFragment();

        matches.forEach(function (match) {
            const button = document.createElement("button");

            button.type = "button";

            button.className = "admin-global-search-result";

            button.setAttribute(
                "aria-label",
                match.item.title +
                ", " +
                match.occurrences +
                " matching occurrences"
            );

            const title = document.createElement("strong");

            title.className = "admin-global-search-result-title";

            title.textContent = match.item.title;

            const category = document.createElement("span");

            category.className = "admin-global-search-result-category";

            category.textContent =
                match.item.category +
                " · " +
                match.occurrences +
                (match.occurrences === 1
                    ? " match"
                    : " matches");

            const snippet = document.createElement("span");

            snippet.className = "admin-global-search-result-snippet";

            snippet.innerHTML = highlightText(
                getSnippet(match.item.text, query),
                query
            );

            button.appendChild(title);

            button.appendChild(category);

            button.appendChild(snippet);

            button.addEventListener("click", function () {
                closeResults();

                navigateToResult(match.item.element);
            });

            fragment.appendChild(button);
        });

        resultsPanel.appendChild(fragment);
    }

    /*
     * Run the search with a short delay to keep typing responsive.
     */

    function scheduleSearch() {
        window.clearTimeout(searchTimer);

        searchTimer = window.setTimeout(function () {
            activeQuery = searchInput.value.trim();

            renderResults(activeQuery);
        }, 100);
    }

    /*
     * Search as the user types.
     */

    searchInput.addEventListener("input", scheduleSearch);

    /*
     * Prevent form submission from reloading the dashboard.
     */

    searchForm.addEventListener("submit", function (event) {
        event.preventDefault();

        window.clearTimeout(searchTimer);

        activeQuery = searchInput.value.trim();

        renderResults(activeQuery);
    });

    /*
     * Escape closes results.
     * Clicking outside the search box/results also closes the panel.
     */

    searchInput.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeResults();
        }
    });

    document.addEventListener("click", function (event) {
        if (
            !searchForm.contains(event.target) &&
            !resultsPanel.contains(event.target)
        ) {
            closeResults();
        }
    });

    /*
     * Refresh current results when dashboard content changes.
     * This supports content loaded asynchronously by existing code.
     */

    const observer = new MutationObserver(function (mutations) {
    const dashboardChanged = mutations.some(function (mutation) {
        return !resultsPanel.contains(mutation.target);
    });

    if (!dashboardChanged || !activeQuery) {
        return;
    }

    window.clearTimeout(observerTimer);

    observerTimer = window.setTimeout(function () {
        if (document.activeElement === searchInput) {
            renderResults(activeQuery);
        }
    }, 150);
});

    observer.observe(dashboard, {
        childList: true,
        subtree: true
    });

    console.info("YASU Tech: Global dashboard search initialized.");
})();