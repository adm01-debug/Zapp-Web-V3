INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('avatars','avatars','t','5242880',NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('stickers','stickers','t',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('audio-memes','audio-memes','t',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('custom-emojis','custom-emojis','t','512000',NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('whatsapp-media','whatsapp-media','f',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('team-chat-files','team-chat-files','f',NULL,NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('audio-messages','audio-messages','f',NULL,NULL) ON CONFLICT (id) DO NOTHING;
