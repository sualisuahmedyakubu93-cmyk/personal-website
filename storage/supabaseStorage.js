const fs = require("fs");

const {
    createClient
} = require("@supabase/supabase-js");

const supabaseUrl =
    process.env.SUPABASE_URL;

const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseBucket =
    process.env.SUPABASE_STORAGE_BUCKET ||
    "yasu-uploads";

const supabaseConfigured =
    Boolean(
        supabaseUrl &&
        supabaseServiceRoleKey
    );

const supabase =
    supabaseConfigured
        ? createClient(
              supabaseUrl,
              supabaseServiceRoleKey,
              {
                  auth: {
                      autoRefreshToken: false,
                      persistSession: false
                  }
              }
          )
        : null;


/*
==========================================
UPLOAD FILE TO SUPABASE STORAGE
==========================================
*/

async function uploadFileToSupabase(
    localFilePath,
    storagePath,
    contentType
) {
    if (!supabaseConfigured) {
        throw new Error(
            "Supabase Storage is not configured."
        );
    }

    const fileBuffer =
        fs.readFileSync(
            localFilePath
        );

    const {
        error
    } =
        await supabase.storage
            .from(
                supabaseBucket
            )
            .upload(
                storagePath,
                fileBuffer,
                {
                    contentType:
                        contentType ||
                        "application/octet-stream",
                    upsert: true
                }
            );

    if (error) {
        throw error;
    }

    return storagePath;
}


/*
==========================================
DELETE FILE FROM SUPABASE STORAGE
==========================================
*/

async function deleteFileFromSupabase(
    storagePath
) {
    if (!supabaseConfigured) {
        return;
    }

    const {
        error
    } =
        await supabase.storage
            .from(
                supabaseBucket
            )
            .remove([
                storagePath
            ]);

    if (error) {
        throw error;
    }
}


/*
==========================================
CREATE SIGNED URL
==========================================
*/

async function createSignedUrl(
    storagePath,
    expiresIn = 3600
) {
    if (!supabaseConfigured) {
        throw new Error(
            "Supabase Storage is not configured."
        );
    }

    const {
        data,
        error
    } =
        await supabase.storage
            .from(
                supabaseBucket
            )
            .createSignedUrl(
                storagePath,
                expiresIn
            );

    if (error) {
        throw error;
    }

    if (
        !data ||
        !data.signedUrl
    ) {
        throw new Error(
            "Supabase did not return a signed URL."
        );
    }

    return data.signedUrl;
}


/*
==========================================
EXPORTS
==========================================
*/

module.exports = {
    supabaseConfigured,
    supabaseBucket,
    uploadFileToSupabase,
    deleteFileFromSupabase,
    createSignedUrl
};