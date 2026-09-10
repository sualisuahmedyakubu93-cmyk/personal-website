const express = require("express");

const {
    all
} = require("../database/database");


const router =
    express.Router();


/*
==========================================
CATEGORY STRUCTURE
==========================================
*/

const categoryStructure = {

    documents: [
        "mathematics",
        "ict",
        "education",
        "reports"
    ],

    speeches: [
        "khutbah",
        "public",
        "academic"
    ],

    presentations: [
        "mathematics",
        "ict",
        "education"
    ],

    writings: [
        "academic",
        "technology",
        "reflections"
    ]

};


/*
==========================================
FORMAT CONTENT FOR PUBLIC USE
==========================================
*/

function formatContent(item) {

    const result = {
        ...item
    };


    /*
    ======================================
    FILE CONTENT
    ======================================
    */

    if (
        item.filename
    ) {

        result.file_url =
            `/uploads/${item.category}/${encodeURIComponent(
                item.filename
            )}`;

    } else {

        /*
        ==================================
        WRITTEN CONTENT
        ==================================
        */

        result.file_url =
            null;

    }


    return result;

}


/*
==========================================
GET ALL PUBLIC CONTENT
==========================================
*/

router.get(
    "/",

    async (
        request,
        response
    ) => {

        try {

            const contents =
                await all(
                    `
                    SELECT *
                    FROM content
                    ORDER BY created_at DESC
                    `
                );


            const result =
                contents.map(
                    formatContent
                );


            response.json(
                result
            );

        } catch (error) {

            console.error(
                "Content retrieval error:",
                error.message
            );


            response.status(500).json({

                message:
                    "Unable to retrieve content."

            });

        }

    }
);


/*
==========================================
GET CONTENT BY CATEGORY
==========================================
*/

router.get(
    "/category/:category",

    async (
        request,
        response
    ) => {

        try {

            const {
                category
            } = request.params;


            if (
                !Object.prototype.hasOwnProperty.call(
                    categoryStructure,
                    category
                )
            ) {

                return response.status(400).json({

                    message:
                        "Invalid category."

                });

            }


            const contents =
                await all(

                    `
                    SELECT *
                    FROM content
                    WHERE category = ?
                    ORDER BY created_at DESC
                    `,

                    [
                        category
                    ]

                );


            const result =
                contents.map(
                    formatContent
                );


            response.json(
                result
            );

        } catch (error) {

            console.error(
                "Category retrieval error:",
                error.message
            );


            response.status(500).json({

                message:
                    "Unable to retrieve content."

            });

        }

    }
);


/*
==========================================
GET CONTENT BY CATEGORY
AND SUBCATEGORY
==========================================
*/

router.get(
    "/:category/:subcategory",

    async (
        request,
        response
    ) => {

        try {

            const {
                category,
                subcategory
            } = request.params;


            /*
            ======================================
            VALIDATE CATEGORY
            ======================================
            */

            if (
                !Object.prototype.hasOwnProperty.call(
                    categoryStructure,
                    category
                )
            ) {

                return response.status(400).json({

                    message:
                        "Invalid category."

                });

            }


            /*
            ======================================
            VALIDATE SUBCATEGORY
            ======================================
            */

            if (
                !categoryStructure[
                    category
                ].includes(
                    subcategory
                )
            ) {

                return response.status(400).json({

                    message:
                        "Invalid subcategory."

                });

            }


            /*
            ======================================
            GET CONTENT
            ======================================
            */

            const contents =
                await all(

                    `
                    SELECT *
                    FROM content
                    WHERE category = ?
                    AND subcategory = ?
                    ORDER BY created_at DESC
                    `,

                    [
                        category,
                        subcategory
                    ]

                );


            /*
            ======================================
            FORMAT CONTENT
            ======================================
            */

            const result =
                contents.map(
                    formatContent
                );


            response.json(
                result
            );

        } catch (error) {

            console.error(
                "Subcategory retrieval error:",
                error.message
            );


            response.status(500).json({

                message:
                    "Unable to retrieve content."

            });

        }

    }
);


/*
==========================================
EXPORT ROUTER
==========================================
*/

module.exports =
    router;