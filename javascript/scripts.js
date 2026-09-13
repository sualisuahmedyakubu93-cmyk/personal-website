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
                "show"
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
                        "show"
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


/*
==========================================
CONTACT FORM
==========================================
*/

document.addEventListener(
    "DOMContentLoaded",

    () => {

        const contactForm =
            document.getElementById(
                "contactForm"
            );

        const formMessage =
            document.getElementById(
                "formMessage"
            );


        if (
            !contactForm
        ) {
            return;
        }


        contactForm.addEventListener(
            "submit",

            async (event) => {

                event.preventDefault();


                if (
                    formMessage
                ) {

                    formMessage.textContent =
                        "Sending message...";

                }


                const name =
                    document.getElementById(
                        "name"
                    )?.value.trim();


                const email =
                    document.getElementById(
                        "email"
                    )?.value.trim();


                const message =
                    document.getElementById(
                        "message"
                    )?.value.trim();


                if (
                    !name ||
                    !email ||
                    !message
                ) {

                    if (
                        formMessage
                    ) {

                        formMessage.textContent =
                            "Please complete all required fields.";

                    }

                    return;

                }


                try {

                    const token =
                        localStorage.getItem(
                            "userToken"
                        ) ||
                        sessionStorage.getItem(
                            "userToken"
                        );


                    const response =
                        await fetch(
                            "/api/contact",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json",

                                    ...(token
                                        ? {
                                            "Authorization":
                                                `Bearer ${token}`
                                        }
                                        : {})
                                },

                                credentials:
                                    "same-origin",

                                body:
                                    JSON.stringify({
                                        name,
                                        email,
                                        subject: "",
                                        message
                                    })
                            }
                        );


                    const data =
                        await response
                            .json()
                            .catch(
                                () => ({})
                            );


                    if (
                        !response.ok
                    ) {

                        if (
                            formMessage
                        ) {

                            formMessage.textContent =
                                data.message ||
                                "Unable to send your message.";

                        }

                        return;

                    }


                    if (
                        formMessage
                    ) {

                        formMessage.textContent =
                            data.message ||
                            "Your message was sent successfully.";

                    }


                    contactForm.reset();

                }
                catch (error) {

                    console.error(
                        "Contact form submission error:",
                        error
                    );


                    if (
                        formMessage
                    ) {

                        formMessage.textContent =
                            "Unable to send your message. Please try again.";

                    }

                }

            }
        );

    }
);