/*
==========================================
AUTOMATIC YEAR
==========================================
*/

const currentYearElement =
    document.getElementById(
        "currentYear"
    );


if (
    currentYearElement
) {

    currentYearElement.textContent =
        new Date().getFullYear();

}


/*
==========================================
NAVIGATION MENU
==========================================
*/

const menuToggle =
    document.getElementById(
        "menuToggle"
    );


const navbar =
    document.getElementById(
        "navbar"
    );


if (
    menuToggle &&
    navbar
) {

    menuToggle.addEventListener(
        "click",

        () => {

            navbar.classList.toggle(
                "active"
            );

        }
    );


    const navigationLinks =
        navbar.querySelectorAll(
            "a"
        );


    navigationLinks.forEach(
        link => {

            link.addEventListener(
                "click",

                () => {

                    navbar.classList.remove(
                        "active"
                    );

                }
            );

        }
    );

}


/*
==========================================
LOGOUT
==========================================
*/

function logout() {

    localStorage.removeItem(
        "userToken"
    );

    localStorage.removeItem(
        "username"
    );

    localStorage.removeItem(
        "userRole"
    );


    sessionStorage.removeItem(
        "userToken"
    );

    sessionStorage.removeItem(
        "username"
    );

    sessionStorage.removeItem(
        "userRole"
    );


    window.location.href =
        "login.html";

}
/*
==========================================
PUBLIC WEBSITE PAGE — HOME
==========================================
*/

async function loadManagedHomeContent() {

    const managedHomeSection =
        document.getElementById(
            "managedHomeContent"
        );

    const managedHomeTitle =
        document.getElementById(
            "managedHomeTitle"
        );

    const managedHomeBody =
        document.getElementById(
            "managedHomeBody"
        );


    if (
        !managedHomeSection ||
        !managedHomeTitle ||
        !managedHomeBody
    ) {
        return;
    }


    try {

        const response =
            await fetch(
                "/api/pages/public/home",
                {
                    method: "GET",
                    credentials: "same-origin"
                }
            );


        if (!response.ok) {

            managedHomeSection.hidden =
                true;

            return;

        }


        const data =
            await response.json();


        if (
            !data.success ||
            !data.page
        ) {

            managedHomeSection.hidden =
                true;

            return;

        }


        const page =
            data.page;


        managedHomeTitle.textContent =
            page.title ||
            "Home";


        /*
        ------------------------------------------
        WRITTEN CONTENT
        ------------------------------------------
        */

        if (
            page.content &&
            page.content.trim()
        ) {

            managedHomeBody.innerHTML =
                page.content;

            managedHomeSection.hidden =
                false;

            return;

        }


        /*
        ------------------------------------------
        UPLOADED FILE
        ------------------------------------------
        */

        if (
            page.file_url &&
            page.original_name
        ) {

            const fileLink =
                document.createElement(
                    "a"
                );

            fileLink.href =
                page.file_url;

            fileLink.target =
                "_blank";

            fileLink.rel =
                "noopener noreferrer";

            fileLink.textContent =
                "Open " +
                page.original_name;


            managedHomeBody.innerHTML =
                "";

            managedHomeBody.appendChild(
                fileLink
            );


            managedHomeSection.hidden =
                false;

            return;

        }


        /*
        ------------------------------------------
        NO CONTENT
        ------------------------------------------
        */

        managedHomeSection.hidden =
            true;

    }
    catch (error) {

        console.error(
            "Error loading managed Home content:",
            error
        );

        managedHomeSection.hidden =
            true;

    }

}


/*
==========================================
LOAD MANAGED HOME CONTENT
==========================================
*/

document.addEventListener(
    "DOMContentLoaded",
    loadManagedHomeContent
);