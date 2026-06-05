const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const client = jwksClient({
    jwksUri: "https://api.line.me/oauth2/v2.1/certs",
});

function getKey(header, callback) {
    client.getSigningKey(header.kid, function (err, key) {
        if (err) {
            callback(err);
            return;
        }

        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

function verifyLineToken(idToken) {
    return new Promise((resolve, reject) => {
        jwt.verify(
            idToken,
            getKey,
            {
                algorithms: ["ES256", "RS256"],
                audience: process.env.LINE_CHANNEL_ID,
            },
            (err, decoded) => {
                if (err) {
                    return reject(err);
                }

                resolve(decoded);
            }
        );
    });
}

module.exports = {
    verifyLineToken,
};