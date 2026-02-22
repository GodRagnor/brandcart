import cloudinary
import cloudinary.uploader

from config.env import (
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
)

cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET,
    secure=True,
)


def upload_image(file, folder: str):
    return cloudinary.uploader.upload(
        file,
        folder=folder,
        resource_type="image",
    )
