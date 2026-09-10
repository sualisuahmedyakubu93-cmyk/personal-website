const jwt = require("jsonwebtoken");

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

function requireAdmin(
    request,
    response,
    next
) {
    if (
        !request.user ||
        request.user.role !== "admin"
    ) {
        return response.status(403).json({
            message:
                "Administrator access is required."
        });
    }

    next();
}

module.exports = {
    authenticateToken,
    requireAdmin
};

