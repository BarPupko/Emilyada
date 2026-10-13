// Shrinks a photo to a small JPEG data URL so it fits inside a Firestore document
// (1 MB limit) without needing Firebase Storage.
// Question pictures: up to ~400 KB; answer pictures: smaller (4 of them share the 1 MB doc).
export default function resizeImage(file, { maxSide = 900, maxChars = 400_000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff' // transparent PNGs would otherwise turn black as JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)

      let quality = 0.8
      let data = canvas.toDataURL('image/jpeg', quality)
      while (data.length > maxChars && quality > 0.3) {
        quality -= 0.1
        data = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("We couldn't open that picture. Please try a different photo (JPG or PNG)."))
    }
    img.src = url
  })
}
