const { get, all } = require("../database/database");

/**
 * Load the current account from the database.
 *
 * Never rely only on a role stored in an old JWT.
 */
async function getCurrentUser(userId) {
    return get(
        `SELECT id, username, email, role, is_verified, is_active
         FROM users
         WHERE id = ?`,
        [userId]
    );
}

/**
 * Determine whether a role has a permission using the database.
 *
 * Role permissions are managed through role_permissions.
 */
async function roleHasPermission(role, permission) {
    if (!role || !permission) {
        return false;
    }

    const result = await get(
        `SELECT 1 AS allowed
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.slug = ?
           AND (
               p.permission_key = '*'
               OR p.permission_key = ?
           )
         LIMIT 1`,
        [role, permission]
    );

    return Boolean(result);
}

/**
 * Check an account's effective permission.
 *
 * An explicit user-level allow or deny takes precedence
 * over the role's permissions.
 */
async function userHasPermission(userId, role, permission) {
    // Check the user's override for this specific permission first.
    const specificOverride = await get(
        `SELECT effect
         FROM user_permissions up
         JOIN permissions p ON p.id = up.permission_id
         WHERE up.user_id = ?
           AND p.permission_key = ?
         LIMIT 1`,
        [userId, permission]
    );

    if (specificOverride) {
        return specificOverride.effect === "allow";
    }

    // If no specific override exists, check the wildcard override.
    const wildcardOverride = await get(
        `SELECT effect
         FROM user_permissions up
         JOIN permissions p ON p.id = up.permission_id
         WHERE up.user_id = ?
           AND p.permission_key = '*'
         LIMIT 1`,
        [userId]
    );

    if (wildcardOverride) {
        return wildcardOverride.effect === "allow";
    }

    // If no user-level override exists, use the database role permissions.
    return roleHasPermission(role, permission);
}

    

/**
 * Verify that a user is authenticated, verified and active.
 */
async function loadAuthorizedUser(request, response) {
    if (!request.user || !request.user.id) {
        response.status(401).json({
            success: false,
            message: "Please log in to continue."
        });

        return null;
    }

    const currentUser = await getCurrentUser(request.user.id);

    if (
        !currentUser ||
        !Number(currentUser.is_verified) ||
        !Number(currentUser.is_active)
    ) {
        response.status(403).json({
            success: false,
            message: "Your account is unavailable, inactive, or not verified."
        });

        return null;
    }

    request.currentUser = currentUser;

    return currentUser;
}

/**
 * Require a specific database-managed permission.
 */
function requirePermission(permission) {
    return async function permissionMiddleware(
        request,
        response,
        next
    ) {
        try {
            const currentUser = await loadAuthorizedUser(
                request,
                response
            );

            if (!currentUser) {
                return;
            }

            const allowed = await userHasPermission(
                currentUser.id,
                currentUser.role,
                permission
            );

            if (!allowed) {
                return response.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to perform this action."
                });
            }

            return next();
        } catch (error) {
            console.error(
                "Permission verification failed:",
                error.message
            );

            return response.status(500).json({
                success: false,
                message: "Unable to verify your permissions."
            });
        }
    };
}

/**
 * Require at least one permission from a list.
 */
function requireAnyPermission(permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
        throw new TypeError(
            "At least one permission must be specified."
        );
    }

    return async function anyPermissionMiddleware(
        request,
        response,
        next
    ) {
        try {
            const currentUser = await loadAuthorizedUser(
                request,
                response
            );

            if (!currentUser) {
                return;
            }

            let allowed = false;

            for (const permission of permissions) {
                if (
                    await userHasPermission(
                        currentUser.id,
                        currentUser.role,
                        permission
                    )
                ) {
                    allowed = true;
                    break;
                }
            }

            if (!allowed) {
                return response.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to perform this action."
                });
            }

            return next();
        } catch (error) {
            console.error(
                "Permission verification failed:",
                error.message
            );

            return response.status(500).json({
                success: false,
                message: "Unable to verify your permissions."
            });
        }
    };
}

/**
 * Require the Super Administrator role.
 *
 * This check is deliberately separate from ordinary
 * configurable role permissions.
 */
async function requireSuperAdmin(request, response, next) {
    try {
        const currentUser = await loadAuthorizedUser(
            request,
            response
        );

        if (!currentUser) {
            return;
        }

        if (currentUser.role !== "super_admin") {
            return response.status(403).json({
                success: false,
                message: "Super Administrator access is required."
            });
        }

        return next();
    } catch (error) {
        console.error(
            "Super Administrator verification failed:",
            error.message
        );

        return response.status(500).json({
            success: false,
            message:
                "Unable to verify Super Administrator permissions."
        });
    }
}

module.exports = {
    getCurrentUser,
    roleHasPermission,
    userHasPermission,
    requirePermission,
    requireAnyPermission,
    requireSuperAdmin
};