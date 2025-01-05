const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");

// Azure Storage and Cosmos DB connection strings
const STORAGE_CONNECTION_STRING = process.env.STORAGE_CONNECTION_STRING;
const COSMOS_DB_CONNECTION_STRING = process.env.COSMOS_DB_CONNECTION_STRING;
const DATABASE_NAME = "VideoAppDB";
const CONTAINER_NAME = "Videos";

// Initialize Blob and Cosmos DB clients
const blobServiceClient = BlobServiceClient.fromConnectionString(STORAGE_CONNECTION_STRING);
const cosmosClient = new CosmosClient(COSMOS_DB_CONNECTION_STRING);

module.exports = async function (context, req) {
    const method = req.method.toUpperCase();

    switch (method) {
        case "POST":
            await uploadVideo(context, req);
            break;
        case "GET":
            await getVideos(context, req);
            break;
        default:
            context.res = {
                status: 405,
                body: "Method Not Allowed",
            };
    }
};

// Upload Video
async function uploadVideo(context, req) {
    const { title, hashtags, videoBase64 } = req.body;

    if (!title || !hashtags || !videoBase64) {
        context.res = {
            status: 400,
            body: "Missing required fields: title, hashtags, videoBase64",
        };
        return;
    }

    try {
        // Save video to Azure Blob Storage
        const containerClient = blobServiceClient.getContainerClient("videos");
        const blobName = `${Date.now()}-${title.replace(/\s+/g, "-")}.mp4`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        const buffer = Buffer.from(videoBase64, "base64");
        await blockBlobClient.upload(buffer, buffer.length);

        // Save metadata to Cosmos DB
        const database = cosmosClient.database(DATABASE_NAME);
        const container = database.container(CONTAINER_NAME);
        const newItem = {
            id: blobName,
            title,
            hashtags,
            url: blockBlobClient.url,
            uploadedAt: new Date(),
        };
        await container.items.create(newItem);

        context.res = {
            status: 201,
            body: { message: "Video uploaded successfully", url: blockBlobClient.url },
        };
    } catch (error) {
        context.log.error(error.message);
        context.res = {
            status: 500,
            body: "Error uploading video",
        };
    }
}

// Get Videos
async function getVideos(context, req) {
    const { search } = req.query;

    try {
        const database = cosmosClient.database(DATABASE_NAME);
        const container = database.container(CONTAINER_NAME);

        const querySpec = search
            ? {
                  query: "SELECT * FROM c WHERE CONTAINS(c.title, @search) OR ARRAY_CONTAINS(c.hashtags, @search)",
                  parameters: [{ name: "@search", value: search }],
              }
            : { query: "SELECT * FROM c ORDER BY c.uploadedAt DESC" };

        const { resources: videos } = await container.items.query(querySpec).fetchAll();

        context.res = {
            status: 200,
            body: videos,
        };
    } catch (error) {
        context.log.error(error.message);
        context.res = {
            status: 500,
            body: "Error retrieving videos",
        };
    }
}
