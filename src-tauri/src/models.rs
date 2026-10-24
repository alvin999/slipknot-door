use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraMountInfo {
    pub mount_path: String,
    pub volume_name: String,
    pub dcim_path: Option<String>,
    pub file_count: usize,
    pub is_camera: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExifMetadata {
    pub camera_model: String,
    pub lens_model: String,
    pub iso: u32,
    pub shutter_speed: String,
    pub aperture: String,
    pub focal_length: String,
    pub date_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawPhotoItem {
    pub file_path: String,
    pub filename: String,
    pub file_size: u64,
    pub extension: String,
    pub frame_no: String,
    pub exif: Option<ExifMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddedPreviewResult {
    pub file_path: String,
    pub mime_type: String,
    pub jpeg_base64: String,
    pub extraction_time_ms: u64,
    pub exif: ExifMetadata,
}
