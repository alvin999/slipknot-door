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
    pub exposure_bias: Option<f32>,
    pub exposure_program: Option<String>,
    pub metering_mode: Option<String>,
    pub color_space: Option<String>,
    pub color_temp: Option<u32>,
    pub tint: Option<i32>,
    pub flash: Option<String>,
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
