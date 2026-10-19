"use strict";

(function () {
    const statusText = document.getElementById("mfaStatusText");
    const methodText = document.getElementById("mfaMethodText");
    const refreshButton = document.getElementById("refreshMfaStatusButton");

    const setupForm = document.getElementById("mfaSetupForm");
    const setupMethod = document.getElementById("mfaSetupMethod");
    const setupPassword = document.getElementById("mfaSetupPassword");
    const setupButton = document.getElementById("startMfaSetupButton");

    const setupVerification = document.getElementById("mfaSetupVerification");
    const setupInstructions = document.getElementById("mfaSetupInstructions");
    const qrContainer = document.getElementById("mfaQrContainer");
    const qrImage = document.getElementById("mfaSetupQrCode");
    const setupVerifyForm = document.getElementById("mfaSetupVerifyForm");
    const setupCode = document.getElementById("mfaSetupCode");
    const verifySetupButton = document.getElementById("verifyMfaSetupButton");

    const recoveryForm = document.getElementById("mfaRecoveryForm");
    const recoveryPassword = document.getElementById("mfaRecoveryPassword");
    const recoveryCode = document.getElementById("mfaRecoveryCode");
    const recoveryButton = document.getElementById("generateMfaRecoveryCodesButton");
    const recoveryContainer = document.getElementById("mfaRecoveryCodesContainer");
    const recoveryOutput = document.getElementById("mfaRecoveryCodesOutput");

    const disableForm = document.getElementById("mfaDisableForm");
    const disablePassword = document.getElementById("mfaDisablePassword");
    const disableCode = document.getElementById("mfaDisableCode");
    const disableButton = document.getElementById("disableMfaButton");

    const message = document.getElementById("securityMfaMessage");

    let currentMfaEnabled = false;
    let currentMfaMethod = null;
    let setupChallengeId = null;

    function getAuthenticationToken() {
        return (
            localStorage.getItem("userToken") ||
            sessionStorage.getItem("userToken") ||
            localStorage.getItem("token") ||
            sessionStorage.getItem("token")
        );
    }

    function showMessage(text, isError) {
        if (!message) return;

        message.textContent = text;
        message.style.color = isError ? "#b42318" : "#08784b";
    }

    async function apiRequest(path, options = {}) {
        const token = getAuthenticationToken();

        if (!token) {
            throw new Error(
                "Your login session was not found. Please sign in again."
            );
        }

        const response = await fetch(path, {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {}),
                Authorization: "Bearer " + token
            }
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error(
                "The server returned an unreadable response. Please try again."
            );
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || "The requested security operation failed."
            );
        }

        return result;
    }

    function clearRecoveryCodes() {
        recoveryOutput.textContent = "";
        recoveryContainer.hidden = true;
    }

    function updateSecurityControls() {
        const authenticatorEnabled =
            currentMfaEnabled &&
            (
                currentMfaMethod === "authenticator" ||
                currentMfaMethod === "totp"
            );

        const emailEnabled =
            currentMfaEnabled &&
            currentMfaMethod === "email";

        setupForm.hidden = currentMfaEnabled;

        recoveryForm.hidden = !authenticatorEnabled;
        disableForm.hidden = !currentMfaEnabled;

        if (emailEnabled) {
            showMessage(
                "Email verification is enabled. The current backend does not yet support disabling email MFA.",
                true
            );
        }
    }

    async function loadMfaStatus() {
        refreshButton.disabled = true;
        statusText.textContent = "Loading security status...";
        methodText.textContent = "Verification method: Loading...";

        try {
            const result = await apiRequest(
                "/api/auth/mfa/status"
            );

            if (
                !result.success ||
                !result.mfa ||
                typeof result.mfa.enabled !== "boolean"
            ) {
                throw new Error(
                    "The server returned an invalid MFA status."
                );
            }

            currentMfaEnabled = result.mfa.enabled;
            currentMfaMethod = result.mfa.method || null;

            if (currentMfaEnabled) {
                statusText.textContent =
                    "Two-step verification is enabled.";

                methodText.textContent =
                    "Verification method: " +
                    (
                        currentMfaMethod === "authenticator" ||
                        currentMfaMethod === "totp"
                            ? "Authenticator app"
                            : currentMfaMethod === "email"
                                ? "Email"
                                : "Unknown"
                    );
            } else {
                statusText.textContent =
                    "Two-step verification is disabled.";

                methodText.textContent =
                    "Verification method: None";
            }

            updateSecurityControls();
        } catch (error) {
            console.error("Unable to load MFA status:", error);

            statusText.textContent =
                "Unable to load security status.";

            methodText.textContent =
                "Verification method: Unavailable";

            showMessage(error.message, true);
        } finally {
            refreshButton.disabled = false;
        }
    }

    setupForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (currentMfaEnabled) {
            showMessage(
                "Two-step verification is already enabled.",
                true
            );
            return;
        }

        const password = setupPassword.value;
        const method = setupMethod.value;

        if (!password) {
            showMessage(
                "Enter your current password to continue.",
                true
            );
            return;
        }

        if (
            method !== "authenticator" &&
            method !== "email"
        ) {
            showMessage(
                "Select a supported verification method.",
                true
            );
            return;
        }

        setupButton.disabled = true;
        showMessage("Starting MFA setup...", false);

        try {
            const result = await apiRequest(
                "/api/auth/mfa/setup",
                {
                    method: "POST",
                    body: JSON.stringify({
                        password: password,
                        method: method
                    })
                }
            );

            if (!result.challengeId) {
                throw new Error(
                    "The server did not return a setup challenge."
                );
            }

            setupChallengeId = result.challengeId;

            setupPassword.value = "";
            setupCode.value = "";

            setupInstructions.textContent =
                result.message ||
                "Enter the verification code to complete setup.";

            qrImage.removeAttribute("src");
            qrContainer.hidden = true;

            if (
                method === "authenticator" &&
                result.qrDataUrl
            ) {
                qrImage.src = result.qrDataUrl;
                qrContainer.hidden = false;
            }

            setupVerification.hidden = false;

            showMessage(
                "Setup started. MFA will not be enabled until verification succeeds.",
                false
            );

            setupCode.focus();
        } catch (error) {
            console.error("Unable to start MFA setup:", error);
            showMessage(error.message, true);
        } finally {
            setupButton.disabled = false;
        }
    });

    setupVerifyForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!setupChallengeId) {
            showMessage(
                "Start MFA setup again before entering a verification code.",
                true
            );
            return;
        }

        const code = setupCode.value.trim();

        if (!/^\d{6}$/.test(code)) {
            showMessage(
                "Enter the six-digit verification code.",
                true
            );
            return;
        }

        verifySetupButton.disabled = true;
        showMessage("Verifying your setup...", false);

        try {
            const result = await apiRequest(
                "/api/auth/mfa/setup/verify",
                {
                    method: "POST",
                    body: JSON.stringify({
                        challengeId: setupChallengeId,
                        code: code
                    })
                }
            );

            setupChallengeId = null;
            setupCode.value = "";
            setupVerification.hidden = true;

            qrImage.removeAttribute("src");
            qrContainer.hidden = true;

            clearRecoveryCodes();

            showMessage(
                result.message ||
                "Two-step verification has been enabled.",
                false
            );

            await loadMfaStatus();
        } catch (error) {
            console.error("Unable to verify MFA setup:", error);
            showMessage(error.message, true);
        } finally {
            verifySetupButton.disabled = false;
        }
    });

    recoveryForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (
            !currentMfaEnabled ||
            (
                currentMfaMethod !== "authenticator" &&
                currentMfaMethod !== "totp"
            )
        ) {
            showMessage(
                "Recovery-code generation requires enabled authenticator MFA.",
                true
            );
            return;
        }

        if (!window.confirm(
            "Generating new recovery codes replaces your previous recovery codes. Continue?"
        )) {
            return;
        }

        const password = recoveryPassword.value;
        const code = recoveryCode.value.trim();

        if (!password || !/^\d{6}$/.test(code)) {
            showMessage(
                "Enter your current password and six-digit authenticator code.",
                true
            );
            return;
        }

        recoveryButton.disabled = true;
        clearRecoveryCodes();

        showMessage("Generating recovery codes...", false);

        try {
            const result = await apiRequest(
                "/api/auth/mfa/recovery-codes",
                {
                    method: "POST",
                    body: JSON.stringify({
                        password: password,
                        code: code
                    })
                }
            );

            if (
                !Array.isArray(result.recoveryCodes) ||
                result.recoveryCodes.length === 0
            ) {
                throw new Error(
                    "The server did not return any recovery codes."
                );
            }

            recoveryOutput.textContent =
                result.recoveryCodes.join("\n");

            recoveryContainer.hidden = false;

            recoveryPassword.value = "";
            recoveryCode.value = "";

            showMessage(
                result.message ||
                "Recovery codes generated. Store them securely now.",
                false
            );
        } catch (error) {
            console.error(
                "Unable to generate recovery codes:",
                error
            );

            showMessage(error.message, true);
        } finally {
            recoveryButton.disabled = false;
        }
    });

    disableForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!currentMfaEnabled) {
            showMessage(
                "Two-step verification is not enabled.",
                true
            );
            return;
        }

        if (currentMfaMethod === "email") {
            showMessage(
                "Email MFA cannot currently be disabled through this dashboard because the backend requires a separate email-verification flow.",
                true
            );
            return;
        }

        if (
            currentMfaMethod !== "authenticator" &&
            currentMfaMethod !== "totp"
        ) {
            showMessage(
                "The current MFA method is not recognized.",
                true
            );
            return;
        }

        if (!window.confirm(
            "Are you sure you want to disable two-step verification?"
        )) {
            return;
        }

        const password = disablePassword.value;
        const code = disableCode.value.trim();

        if (!password || !/^\d{6}$/.test(code)) {
            showMessage(
                "Enter your current password and six-digit authenticator code.",
                true
            );
            return;
        }

        disableButton.disabled = true;
        showMessage("Verifying your identity...", false);

        try {
            const result = await apiRequest(
                "/api/auth/mfa/disable",
                {
                    method: "POST",
                    body: JSON.stringify({
                        password: password,
                        code: code
                    })
                }
            );

            disablePassword.value = "";
            disableCode.value = "";

            setupChallengeId = null;
            setupVerification.hidden = true;

            qrImage.removeAttribute("src");
            qrContainer.hidden = true;

            clearRecoveryCodes();

            showMessage(
                result.message ||
                "Two-step verification has been disabled.",
                false
            );

            await loadMfaStatus();
        } catch (error) {
            console.error("Unable to disable MFA:", error);
            showMessage(error.message, true);
        } finally {
            disableButton.disabled = false;
        }
    });

    refreshButton.addEventListener("click", function () {
        loadMfaStatus();
    });

    loadMfaStatus();
})();