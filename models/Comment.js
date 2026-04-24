const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
 postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true, index: true },
 authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
 authorName: { type: String, required: true, trim: true },
 content: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("Comment", commentSchema);