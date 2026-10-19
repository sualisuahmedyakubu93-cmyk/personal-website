const jwt = require("jsonwebtoken");

const {
    get
} = require("../database/database");

function authenticateToken(
    request,
    response,
    next
) {
    const authorizationHeader =
        request.headers.authorization;

    const token =
        authorizationHeader &&
        authorizationHeader.startsWith("Bearer ")
            ? authorizationHeader.split(" ")[1]
            : null;

    if (!token) {
        return response.status(401).json({
            message: "Please log in to continue."
        });
    }

    jwt.verify(
        token,
        process.env.JWT_SECRET,
        (error, user) => {
            if (error) {
                return response.status(403).json({
                    message:
                        "Your session has expired. Please log in again."
                });
            }

            request.user = user;
            next();
        }
    );
}

async function requireAdmin(
    request,
    response,
    next
) {
    try {
        if (
            !request.user ||
            !request.user.id
        ) {
            return response.status(401).json({
                message:
                    "Please log in to continue."
            });
        }

        const currentUser = await get(
            `
            SELECT
                id,
                username,
                email,
                role,
                is_verified
            FROM users
            WHERE id = ?
            `,
            [request.user.id]
        );

        if (
            !currentUser ||
            !currentUser.is_verified
        ) {
            return response.status(403).json({
                message:
                    "Your account is unavailable or not verified."
            });
        }

        const allowedRoles = [
            "admin",
            "super_admin"
        ];

        if (
            !allowedRoles.includes(
                currentUser.role
            )
        ) {
            return response.status(403).json({
                message:
                    "Administrator access is required."
            });
        }

        request.currentUser = currentUser;

        next();

    } catch (error) {
        console.error(
            "Administrator authorization error:",
            error.message
        );

        return response.status(500).json({
            message:
                "Unable to verify administrator permissions."
        });
    }
}
    

module.exports = {
    authenticateToken,
    requireAdmin
};

