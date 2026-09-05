/*
==========================================
GET SAVED LOGIN TOKEN
==========================================
*/

const userToken =
    localStorage.getItem(
        "userToken"
    ) ||
    sessionStorage.getItem(
        "userToken"
    );


/*
==========================================
PUBLIC PAGES
==========================================
*/

const publicPages = [
    "",
    "login.html",
    "register.html",
    "verify-otp.html"
];


const currentPage =
    window.location.pathname
        .split("/")
        .pop();


/*
==========================================
PROTECT WEBSITE
==========================================
*/

if (
    !publicPages.includes(
        currentPage
    ) &&
    currentPage !== ""
) {

    if (!userToken) {

        window.location.href =
            "login.html";

    }
}


/*
==========================================
AUTOMATIC YEAR
==========================================
*/

const currentYearElement =
    document.getElementById(
        "currentYear"
    );


if (currentYearElement) {

    currentYearElement.textContent =
        new Date().getFullYear();

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