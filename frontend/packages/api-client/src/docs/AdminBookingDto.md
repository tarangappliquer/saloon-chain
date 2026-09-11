# AdminBookingDto


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**bookingId** | **number** |  | [default to undefined]
**locationId** | **number** |  | [default to undefined]
**locationName** | **string** |  | [default to undefined]
**customerId** | **number** |  | [default to undefined]
**customerName** | **string** |  | [default to undefined]
**customerEmail** | **string** |  | [default to undefined]
**customerPhone** | **string** |  | [default to undefined]
**status** | **string** |  | [default to undefined]
**createdDate** | **string** |  | [default to undefined]
**treatments** | [**Array&lt;StaffBookingTreatmentLineDto&gt;**](StaffBookingTreatmentLineDto.md) |  | [default to undefined]
**appointmentStatusId** | **number** |  | [optional] [default to undefined]
**appointmentStatusName** | **string** |  | [optional] [default to undefined]
**appointmentStatusColorHex** | **string** |  | [optional] [default to undefined]
**cancelReasonId** | **number** |  | [optional] [default to undefined]
**cancelReasonName** | **string** |  | [optional] [default to undefined]
**isPaid** | **boolean** |  | [optional] [default to false]
**paymentProvider** | **string** |  | [optional] [default to undefined]

## Example

```typescript
import { AdminBookingDto } from './api';

const instance: AdminBookingDto = {
    bookingId,
    locationId,
    locationName,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    status,
    createdDate,
    treatments,
    appointmentStatusId,
    appointmentStatusName,
    appointmentStatusColorHex,
    cancelReasonId,
    cancelReasonName,
    isPaid,
    paymentProvider,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
