const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
 title: { type: String, required: true, trim: true },
 content: { type: String, required: true, trim: true },
 category: { type: String, default: "General", trim: true },
 postType: { type: String, default: "discussion", trim: true },
 link: { type: String, default: "", trim: true },
 tags: [{ type: String, trim: true }],
 authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
 authorName: { type: String, required: true, trim: true },
 authorMID: { type: String, required: true, trim: true },
 upvotes: { type: Number, default: 0 },
 upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
 isPinned: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Post", postSchema);